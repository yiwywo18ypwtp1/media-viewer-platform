import { z } from "zod";
import { folderNameSchema, MAX_FOLDER_DEPTH } from "@/features/folders/schema";

// Shared by the uploader (client-side checks before anything is sent) and the
// /api/uploads route handlers (the checks that actually count).

export const MAX_FILE_SIZE = 5 * 1024 ** 3; // 5 GB
export const MAX_FILES_PER_BATCH = 20;

// The browser-reported type decides the asset kind. It can lie (a renamed .exe),
// so the worker still probes the real content and fails the version if it's not media.
export const ALLOWED_MIME_TYPES = {
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
} as const;

export type AllowedMimeType = keyof typeof ALLOWED_MIME_TYPES;

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return Object.hasOwn(ALLOWED_MIME_TYPES, value);
}

const MIME_TYPES = Object.keys(ALLOWED_MIME_TYPES) as [AllowedMimeType, ...AllowedMimeType[]];

// --- Part planning ---

const MIN_PART_SIZE = 16 * 1024 ** 2; // S3 requires >= 5 MiB for all parts but the last.
const MAX_PARTS = 10_000; // S3 limit per multipart upload.

export function planParts(fileSize: number): { partSize: number; partCount: number } {
  const partSize = Math.max(MIN_PART_SIZE, Math.ceil(fileSize / MAX_PARTS));
  return { partSize, partCount: Math.max(1, Math.ceil(fileSize / partSize)) };
}

// Byte range of a part (1-based, like S3 part numbers).
export function partRange(partNumber: number, partSize: number, fileSize: number) {
  const start = (partNumber - 1) * partSize;
  return { start, end: Math.min(start + partSize, fileSize) };
}

// --- Request bodies ---

export const createUploadSchema = z.object({
  projectId: z.uuid(),
  // Present when uploading a new version of an existing asset.
  assetId: z.uuid().optional(),
  // Where a new asset goes: the open folder, plus the subfolders the file sat
  // in when a whole folder was dropped (created on the server as needed).
  folderId: z.uuid().nullable().default(null),
  folderPath: z.array(folderNameSchema).max(MAX_FOLDER_DEPTH).default([]),
  fileName: z.string().trim().min(1).max(255),
  size: z
    .number()
    .int()
    .positive("The file is empty.")
    .max(MAX_FILE_SIZE, "Files can be at most 5 GB."),
  mimeType: z.enum(MIME_TYPES, "Only MP4, MOV, WebM, JPEG, PNG and WebP files are supported."),
});

export const presignPartsSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(MAX_PARTS)).min(1).max(50),
});

export const completeUploadSchema = z.object({
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(MAX_PARTS), etag: z.string().min(1) }))
    .min(1)
    .max(MAX_PARTS),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "Expected a hex SHA-256."),
});

// --- Responses ---

export type CreateUploadResponse = { uploadId: string; partSize: number; partCount: number };
// GET /api/uploads/:id: what a reloaded page needs to carry on.
export type UploadStateResponse = {
  status: "uploading" | "completed" | "aborted";
  partSize: number;
  partCount: number;
  // Parts S3 actually holds, with their ETags.
  parts: { partNumber: number; etag: string }[];
};
export type PresignPartsResponse = { urls: { partNumber: number; url: string }[] };
export type CompleteUploadResponse = { assetId: string; versionId: string };
