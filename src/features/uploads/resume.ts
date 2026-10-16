import { partRange } from "./schema";

// Resuming an upload after a reload, as pure functions (tested in resume.test.ts).
// The browser keeps a ResumeRecord per file in IndexedDB (resume-store.ts):
// which multipart upload it belongs to and which parts were sent, with ETags.

export type SentPart = { partNumber: number; etag: string };

export type ResumeRecord = {
  key: string;
  projectId: string;
  assetId: string | null;
  fileName: string;
  size: number;
  uploadId: string;
  partSize: number;
  parts: SentPart[];
  updatedAt: number;
};

// MinIO drops multipart uploads untouched for 24 h (MINIO_API_STALE_UPLOADS_EXPIRY),
// so an older record points at nothing.
export const RESUME_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// How many leading bytes identify "the same file" together with name and size.
// Reading 4 MiB is instant; hashing all 5 GB just to recognise a file is not.
export const HEAD_BYTES = 4 * 1024 * 1024;

// One record per (target, file). The same file uploaded as a new asset and as
// a new version of an existing one are different uploads.
export function resumeKey(
  target: { projectId: string; assetId?: string | null },
  file: { name: string; size: number },
  headSha256: string,
): string {
  return [target.projectId, target.assetId ?? "new", file.size, headSha256, file.name].join("|");
}

export function isExpired(record: Pick<ResumeRecord, "updatedAt">, now: number): boolean {
  return now - record.updatedAt > RESUME_MAX_AGE_MS;
}

// Parts that count as already uploaded: the browser noted them as sent AND S3
// lists them with the same ETag. The browser's note alone could be wrong (a
// part S3 never stored, a record from another tab); S3 alone would do, but
// the ETag match makes sure both sides mean the same bytes.
export function confirmedParts(sent: SentPart[], inStorage: SentPart[]): Set<number> {
  const stored = new Map(inStorage.map((part) => [part.partNumber, part.etag]));
  return new Set(sent.filter((part) => stored.get(part.partNumber) === part.etag).map((part) => part.partNumber));
}

// Bytes covered by the record's parts (for "40% uploaded earlier").
export function sentBytes(record: Pick<ResumeRecord, "parts" | "partSize" | "size">): number {
  return record.parts.reduce((sum, part) => {
    const { start, end } = partRange(part.partNumber, record.partSize, record.size);
    return sum + (end - start);
  }, 0);
}
