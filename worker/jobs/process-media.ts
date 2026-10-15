import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { UnrecoverableError, type Job } from "bullmq";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import type { MediaJob } from "../../src/server/jobs";
import { projectChannel, type ProcessingEvent } from "../../src/server/realtime";
import * as schema from "../../src/server/schema";
import { ffmpeg, probe, type MediaInfo } from "../ffmpeg";

// One job = one asset version: verify the original, read its metadata, render
// what the browser needs (poster + 720p MP4, or WebP previews), store it.
//
// Idempotent: outputs go to fixed keys (versions/<id>/...), so a re-run
// overwrites the same objects and updates the same row instead of adding new
// ones. A version already "ready" is skipped.

const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000;
const DB_PROGRESS_STEP = 5; // write progress to Postgres every 5%; Redis gets every change

type Deps = {
  db: PostgresJsDatabase<typeof schema>;
  s3: S3Client;
  bucket: string;
  publisher: Redis;
  log: Logger;
};

type Output = { name: string; contentType: string };

export function createProcessMedia({ db, s3, bucket, publisher, log }: Deps) {
  const { assetVersions, assets } = schema;

  return async function processMedia(job: Job<MediaJob>) {
    const { versionId } = job.data;
    const [version] = await db
      .select({
        assetId: assetVersions.assetId,
        projectId: assets.projectId,
        kind: assets.kind,
        state: assetVersions.processingState,
        originalKey: assetVersions.originalKey,
        originalSize: assetVersions.originalSize,
        originalChecksum: assetVersions.originalChecksum,
      })
      .from(assetVersions)
      .innerJoin(assets, eq(assets.id, assetVersions.assetId))
      .where(eq(assetVersions.id, versionId))
      .limit(1);

    if (!version) return log.warn({ jobId: job.id, versionId }, "version no longer exists, skipping");
    if (version.state === "ready") return log.info({ jobId: job.id, versionId }, "already processed, skipping");

    const jobLog = log.child({ jobId: job.id, versionId, attempt: job.attemptsMade + 1 });
    let lastDbProgress = 0;

    async function update(
      fields: Partial<typeof assetVersions.$inferInsert> & Pick<ProcessingEvent, "state" | "progress">,
    ) {
      await db.update(assetVersions).set(fields).where(eq(assetVersions.id, versionId));
      await publish(fields.state, fields.progress, fields.processingError ?? null);
    }

    async function publish(state: ProcessingEvent["state"], progress: number, error: string | null) {
      const event: ProcessingEvent = { type: "processing", assetId: version.assetId, versionId, state, progress, error };
      await publisher.publish(projectChannel(version.projectId), JSON.stringify(event));
    }

    // Live progress for the browser; Postgres only every few percent.
    async function reportProgress(progress: number) {
      await publish("running", progress, null);
      if (progress - lastDbProgress >= DB_PROGRESS_STEP) {
        lastDbProgress = progress;
        await db.update(assetVersions).set({ processingProgress: progress }).where(eq(assetVersions.id, versionId));
      }
    }

    await update({
      state: "running",
      progress: 0,
      processingState: "running",
      processingProgress: 0,
      processingError: null,
      processingAttempts: job.attemptsMade + 1,
    });
    jobLog.info("processing started");

    const signal = AbortSignal.timeout(PROCESSING_TIMEOUT_MS);
    const dir = await mkdtemp(join(tmpdir(), `version-${versionId}-`));
    try {
      const input = join(dir, "original");
      await downloadAndVerify(input, version, signal);

      const info = await probe(input, signal);
      if (info.kind !== version.kind) {
        throw new UnrecoverableError(`Expected ${version.kind === "video" ? "a video" : "an image"}, got ${info.kind === "video" ? "a video" : "an image"}.`);
      }

      const outputs =
        info.kind === "video"
          ? await renderVideo(input, dir, info, signal, (progress) => {
              void reportProgress(progress).catch((error) => jobLog.warn({ err: error }, "progress report failed"));
            })
          : await renderImage(input, dir, signal);

      const keys: Record<string, string> = {};
      for (const output of outputs) {
        keys[output.name] = `versions/${versionId}/${output.name}`;
        await putFile(join(dir, output.name), keys[output.name], output.contentType);
      }

      await update({
        state: "ready",
        progress: 100,
        processingState: "ready",
        processingProgress: 100,
        processingError: null,
        posterKey: keys["poster.jpg"] ?? keys["thumb.webp"],
        mp4Key: keys["720p.mp4"] ?? null,
        previewKey: keys["preview.webp"] ?? null,
        width: info.width,
        height: info.height,
        durationMs: info.kind === "video" ? info.durationMs : null,
        fps: info.kind === "video" ? info.fps : null,
      });
      jobLog.info({ kind: info.kind }, "processing finished");
    } catch (error) {
      const finalAttempt =
        error instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const message = userFacingError(error);
      // Not final: back to "pending" while BullMQ waits to retry (the badge
      // shows "waiting" with the last error); final: "failed" for good.
      await update({
        state: finalAttempt ? "failed" : "pending",
        progress: 0,
        processingState: finalAttempt ? "failed" : "pending",
        processingProgress: 0,
        processingError: message,
      });
      jobLog.warn({ err: error, finalAttempt }, "processing failed");
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };

  // Streams the original to disk and hashes it in the same pass: one read of
  // the file, constant memory, even for 5 GB. This is where the browser's
  // SHA-256 is verified (the web server never touches the bytes).
  async function downloadAndVerify(
    path: string,
    version: { originalKey: string; originalSize: number; originalChecksum: string },
    signal: AbortSignal,
  ) {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: version.originalKey }), {
      abortSignal: signal,
    });
    const hash = createHash("sha256");
    let size = 0;
    await pipeline(
      // In Node the SDK returns the body as a Readable stream.
      object.Body as Readable,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          hash.update(chunk);
          size += chunk.length;
          yield chunk;
        }
      },
      createWriteStream(path),
      { signal },
    );
    if (size !== version.originalSize || hash.digest("hex") !== version.originalChecksum) {
      throw new UnrecoverableError("The stored file doesn't match what was uploaded (checksum mismatch). Upload it again.");
    }
  }

  async function putFile(path: string, key: string, contentType: string) {
    const { size } = await stat(path);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }
}

// Unrecoverable errors carry messages written for users ("Not a video..."),
// or ffmpeg's own reason. Anything else (S3, DB, network) may contain internal
// details like hostnames: the user gets a generic text, the log gets the rest.
function userFacingError(error: unknown): string {
  if (error instanceof UnrecoverableError) return error.message;
  if (error instanceof Error && error.message.endsWith("timed out")) return "Processing took too long and was stopped.";
  return "A temporary error interrupted processing.";
}

async function renderVideo(
  input: string,
  dir: string,
  info: Extract<MediaInfo, { kind: "video" }>,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<Output[]> {
  // Never upscale: min(720, source height); -2 keeps the width even (H.264 needs it).
  const scale = "scale=-2:'min(720,ih)'";
  // 1 s in skips black first frames; very short clips use their middle.
  const posterAt = Math.min(1, info.durationMs / 2000).toFixed(3);

  await ffmpeg(["-ss", posterAt, "-i", input, "-frames:v", "1", "-vf", scale, "-q:v", "3", join(dir, "poster.jpg")], {
    signal,
  });
  await ffmpeg(
    [
      "-i", input,
      "-vf", scale,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      // moov atom at the start: playback can begin before the whole file loads.
      "-movflags", "+faststart",
      join(dir, "720p.mp4"),
    ],
    {
      signal,
      // 0-99 while encoding; 100 is set only once everything is stored.
      onPositionMs: (positionMs) => onProgress(Math.min(99, Math.floor((positionMs / info.durationMs) * 100))),
    },
  );

  return [
    { name: "poster.jpg", contentType: "image/jpeg" },
    { name: "720p.mp4", contentType: "video/mp4" },
  ];
}

// Two WebP sizes: a thumbnail for lists and a large preview for viewing.
async function renderImage(input: string, dir: string, signal: AbortSignal): Promise<Output[]> {
  for (const [name, maxWidth] of [["thumb.webp", 640], ["preview.webp", 1920]] as const) {
    await ffmpeg(
      ["-i", input, "-frames:v", "1", "-vf", `scale='min(${maxWidth},iw)':-2`, "-c:v", "libwebp", "-quality", "82", join(dir, name)],
      { signal },
    );
  }
  return [
    { name: "thumb.webp", contentType: "image/webp" },
    { name: "preview.webp", contentType: "image/webp" },
  ];
}
