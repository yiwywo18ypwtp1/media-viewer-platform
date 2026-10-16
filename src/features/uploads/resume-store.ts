import { sha256 } from "hash-wasm";
import { HEAD_BYTES, resumeKey, type ResumeRecord } from "./resume";

// ResumeRecords in IndexedDB: a few small objects per user, so a thin promise
// wrapper is enough (no library). Every caller treats failures as "no resume":
// private windows and blocked storage just upload from the start.

const DB_NAME = "media-review-hub";
const STORE = "uploads";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = undefined;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const getRecord = (key: string) => run<ResumeRecord | undefined>("readonly", (s) => s.get(key));
export const putRecord = (record: ResumeRecord) => run("readwrite", (s) => s.put(record));
export const deleteRecord = (key: string) => run("readwrite", (s) => s.delete(key));
export const listRecords = () => run<ResumeRecord[]>("readonly", (s) => s.getAll());

// Identifies the file by name, size and a hash of its first megabytes (only
// those are read from disk).
export async function resumeKeyFor(file: File, target: { projectId: string; assetId?: string | null }) {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  return resumeKey(target, file, await sha256(head));
}
