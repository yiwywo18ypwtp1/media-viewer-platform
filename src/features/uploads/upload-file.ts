import { hashFile } from "./hash-file";
import {
  partRange,
  type CompleteUploadResponse,
  type CreateUploadResponse,
  type PresignPartsResponse,
} from "./schema";
import { addSample, estimateTransfer, type RateSample } from "./transfer-rate";

// Uploads one file to S3 as a multipart upload. Plain TypeScript, no React:
// concurrency, retries and cancellation are imperative, and keeping them out
// of components makes them readable (and testable) on their own. The React
// side only renders snapshots (see use-uploads.ts).
//
//   queued -> uploading -> completing -> done
//                 |  ^          |
//          pause  v  | resume   v
//              paused         error -> retry -> queued
//   (cancel from any non-final state)

export type UploadStatus = "queued" | "uploading" | "paused" | "completing" | "done" | "error" | "cancelled";

export type UploadSnapshot = {
  status: UploadStatus;
  uploadedBytes: number;
  totalBytes: number;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
  error?: string;
  result?: CompleteUploadResponse;
};

type Part = {
  number: number;
  start: number;
  end: number;
  state: "pending" | "uploading" | "done" | "failed";
  loaded: number;
  etag?: string;
  attempts: number;
  // Incremented whenever an attempt is superseded (pause, cancel, retry), so
  // late callbacks from the old attempt are recognised and ignored.
  attemptId: number;
  xhr?: XMLHttpRequest;
};

const PARALLEL_PARTS = 4;
const MAX_PART_ATTEMPTS = 6; // backoff 1+2+4+8+16 s: rides out a ~30 s network drop
const URL_BATCH_SIZE = 20;
const PROGRESS_EMIT_MS = 250; // XHR progress fires far more often than the UI needs
const STALL_TIMEOUT_MS = 30_000;

export class FileUpload {
  private status: UploadStatus = "queued";
  private uploadId?: string;
  private parts: Part[] = [];
  private urls = new Map<number, string>();
  private urlRequest?: Promise<void>;
  private hash?: Promise<string>;
  private readonly hashAbort = new AbortController();
  private error?: string;
  private result?: CompleteUploadResponse;
  private samples: RateSample[] = [];
  private lastEmit = 0;

  constructor(
    readonly file: File,
    private readonly target: { projectId: string; assetId?: string },
    private readonly onChange: (snapshot: UploadSnapshot) => void,
  ) {}

  get isActive() {
    return this.status === "uploading" || this.status === "completing";
  }

  snapshot(): UploadSnapshot {
    const uploadedBytes = this.parts.reduce((sum, part) => sum + part.loaded, 0);
    const moving = this.status === "uploading";
    const { bytesPerSecond, etaSeconds } = moving
      ? estimateTransfer(this.samples, this.file.size)
      : { bytesPerSecond: null, etaSeconds: null };
    return {
      status: this.status,
      uploadedBytes: this.status === "done" ? this.file.size : uploadedBytes,
      totalBytes: this.file.size,
      bytesPerSecond,
      etaSeconds,
      error: this.error,
      result: this.result,
    };
  }

  // --- Commands (called by the queue / UI) ---

  async start() {
    if (this.status !== "queued") return;
    this.setStatus("uploading");
    try {
      if (!this.uploadId) await this.create();
      // Hash in parallel with the upload; complete() waits for it.
      this.hash ??= hashFile(this.file, this.hashAbort.signal);
      this.hash.catch(() => {}); // handled in complete(); avoid an unhandled rejection meanwhile
      this.pump();
    } catch (error) {
      this.fail(error);
    }
  }

  pause() {
    if (this.status !== "uploading") return;
    this.stopActiveParts();
    this.setStatus("paused");
  }

  resume() {
    if (this.status === "paused") this.setStatus("queued");
  }

  retry() {
    if (this.status !== "error") return;
    // A manual retry starts every unfinished part with a full set of attempts.
    for (const part of this.parts) {
      if (part.state !== "done") Object.assign(part, { state: "pending", attempts: 0, loaded: 0 });
    }
    this.error = undefined;
    this.setStatus("queued");
  }

  async cancel() {
    // Not while completing: every byte is in S3 and the version is being
    // created; a cancel racing with that would leave the UI and server disagreeing.
    if (this.status === "done" || this.status === "cancelled" || this.status === "completing") return;
    this.stopActiveParts();
    this.hashAbort.abort();
    this.setStatus("cancelled");
    if (this.uploadId) {
      // Best effort: tells S3 to drop the parts. If it fails, the cleanup job does it.
      await api(`/api/uploads/${this.uploadId}`, { method: "DELETE" }).catch(() => {});
    }
  }

  // --- Internals ---

  private async create() {
    const { uploadId, partSize, partCount } = await api<CreateUploadResponse>("/api/uploads", {
      body: {
        projectId: this.target.projectId,
        assetId: this.target.assetId,
        fileName: this.file.name,
        size: this.file.size,
        mimeType: this.file.type,
      },
    });
    this.uploadId = uploadId;
    this.parts = Array.from({ length: partCount }, (_, i) => ({
      number: i + 1,
      ...partRange(i + 1, partSize, this.file.size),
      state: "pending" as const,
      loaded: 0,
      attempts: 0,
      attemptId: 0,
    }));
  }

  // Keeps up to PARALLEL_PARTS parts in flight; called after every part event.
  private pump() {
    if (this.status !== "uploading") return;

    if (this.parts.every((part) => part.state === "done")) {
      void this.complete();
      return;
    }

    // One part out of attempts fails the file right away. Waiting for every
    // other part to exhaust its attempts too would take minutes on a big file.
    if (this.parts.some((part) => part.state === "failed")) {
      this.stopActiveParts();
      this.fail(new Error("Upload interrupted. Check your connection and retry."));
      return;
    }

    const inFlight = this.parts.filter((part) => part.state === "uploading").length;
    const pending = this.parts.filter((part) => part.state === "pending");
    for (const part of pending.slice(0, PARALLEL_PARTS - inFlight)) void this.uploadPart(part);
  }

  private async uploadPart(part: Part) {
    const attemptId = ++part.attemptId;
    part.state = "uploading";
    part.attempts += 1;

    try {
      const url = await this.urlFor(part.number);
      if (part.attemptId !== attemptId) return;
      part.etag = await this.putPart(part, url);
      if (part.attemptId !== attemptId) return;
      part.state = "done";
      part.loaded = part.end - part.start;
    } catch (error) {
      if (part.attemptId !== attemptId) return; // superseded by pause/cancel
      part.loaded = 0;
      // The URL may have expired (e.g. after a long pause): fetch a fresh one next time.
      this.urls.delete(part.number);

      if (part.attempts >= MAX_PART_ATTEMPTS) {
        part.state = "failed";
      } else {
        this.emit(true);
        await sleep(1000 * 2 ** (part.attempts - 1));
        if (part.attemptId !== attemptId) return;
        part.state = "pending";
      }
      console.warn(`Part ${part.number} failed (attempt ${part.attempts})`, error);
    }

    this.emit(true);
    this.pump();
  }

  // Presigned URLs are fetched in batches, one request at a time.
  private async urlFor(partNumber: number): Promise<string> {
    while (!this.urls.has(partNumber)) {
      this.urlRequest ??= this.fetchUrls(partNumber).finally(() => {
        this.urlRequest = undefined;
      });
      await this.urlRequest;
    }
    return this.urls.get(partNumber)!;
  }

  private async fetchUrls(firstPart: number) {
    const others = this.parts
      .filter((part) => part.number !== firstPart && part.state !== "done" && !this.urls.has(part.number))
      .slice(0, URL_BATCH_SIZE - 1)
      .map((part) => part.number);
    const { urls } = await api<PresignPartsResponse>(`/api/uploads/${this.uploadId}/parts`, {
      body: { partNumbers: [firstPart, ...others] },
    });
    for (const { partNumber, url } of urls) this.urls.set(partNumber, url);
  }

  // XHR rather than fetch: fetch can't report upload progress.
  // file.slice() is lazy, so only this part is read from disk, never the whole file.
  private putPart(part: Part, url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      part.xhr = xhr;

      // A dead connection doesn't always error; sometimes it just hangs.
      // No progress for STALL_TIMEOUT_MS counts as a failed attempt. (Not
      // xhr.timeout: that caps the *total* time, which a slow but healthy
      // connection could legitimately exceed.)
      let lastActivity = Date.now();
      let stalled = false;
      const watchdog = setInterval(() => {
        if (Date.now() - lastActivity < STALL_TIMEOUT_MS) return;
        stalled = true;
        xhr.abort();
      }, 1000);
      const settle = () => {
        clearInterval(watchdog);
        part.xhr = undefined;
      };

      xhr.open("PUT", url);
      xhr.upload.onprogress = (event) => {
        lastActivity = Date.now();
        part.loaded = event.loaded;
        this.emit(false);
      };
      xhr.onload = () => {
        settle();
        const etag = xhr.getResponseHeader("ETag");
        if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
        else reject(new Error(etag ? `S3 responded ${xhr.status}` : "No ETag in response (S3 CORS)"));
      };
      xhr.onerror = () => {
        settle();
        reject(new Error("Network error"));
      };
      xhr.onabort = () => {
        settle();
        reject(stalled ? new Error("Connection stalled") : new DOMException("Upload aborted", "AbortError"));
      };
      xhr.send(this.file.slice(part.start, part.end));
    });
  }

  private stopActiveParts() {
    for (const part of this.parts) {
      if (part.state !== "uploading") continue;
      part.attemptId += 1; // invalidates the running attempt (including a backoff sleep)
      part.xhr?.abort();
      part.state = "pending";
      part.loaded = 0;
    }
  }

  private async complete() {
    this.setStatus("completing");
    try {
      const sha256 = await this.hash!;
      this.result = await api<CompleteUploadResponse>(`/api/uploads/${this.uploadId}/complete`, {
        body: {
          parts: this.parts.map((part) => ({ partNumber: part.number, etag: part.etag! })),
          sha256,
        },
      });
      this.setStatus("done");
    } catch (error) {
      // Retrying only re-sends "complete": all parts are already in S3, and
      // the endpoint is idempotent.
      if (this.status === "completing") this.fail(error);
    }
  }

  private fail(error: unknown) {
    if (this.status === "cancelled") return;
    this.error = error instanceof Error ? error.message : String(error);
    this.setStatus("error");
  }

  private setStatus(status: UploadStatus) {
    this.status = status;
    this.samples = [];
    this.emit(true);
  }

  private emit(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastEmit < PROGRESS_EMIT_MS) return;
    this.lastEmit = now;
    const snapshot = this.snapshot();
    if (this.status === "uploading") {
      this.samples = addSample(this.samples, { time: now, bytes: snapshot.uploadedBytes });
    }
    this.onChange(snapshot);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// JSON call to our API. Throws with the server's message from the
// { error: { message } } envelope.
async function api<T = void>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? "POST",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? `Request failed (${response.status})`);
  return data as T;
}
