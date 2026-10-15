import type { HashWorkerMessage } from "./hash.worker";

// Promise wrapper around the hashing Web Worker. One worker per file; it's
// terminated when done or when the upload is cancelled.
export function hashFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" });

    const stop = () => {
      worker.terminate();
      reject(new DOMException("Hashing cancelled", "AbortError"));
    };
    signal.addEventListener("abort", stop, { once: true });

    worker.onmessage = (event: MessageEvent<HashWorkerMessage>) => {
      signal.removeEventListener("abort", stop);
      worker.terminate();
      if (event.data.type === "done") resolve(event.data.sha256);
      else reject(new Error(`Hashing failed: ${event.data.message}`));
    };
    worker.onerror = (event) => {
      signal.removeEventListener("abort", stop);
      worker.terminate();
      reject(new Error(`Hashing failed: ${event.message}`));
    };

    worker.postMessage(file);
  });
}
