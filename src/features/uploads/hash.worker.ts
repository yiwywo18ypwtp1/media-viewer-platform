/// <reference lib="webworker" />
import { createSHA256 } from "hash-wasm";

// Runs off the main thread so hashing a 5 GB file never blocks the UI.
// Reads the file in chunks: memory use stays at one chunk, not the whole file.
// (crypto.subtle.digest can't hash incrementally, hence hash-wasm.)

const CHUNK_SIZE = 8 * 1024 * 1024;

export type HashWorkerMessage = { type: "done"; sha256: string } | { type: "error"; message: string };

self.onmessage = async (event: MessageEvent<File>) => {
  const file = event.data;
  try {
    const hasher = await createSHA256();
    hasher.init();
    for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
      const chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
      hasher.update(new Uint8Array(chunk));
    }
    self.postMessage({ type: "done", sha256: hasher.digest("hex") } satisfies HashWorkerMessage);
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) } satisfies HashWorkerMessage);
  }
};
