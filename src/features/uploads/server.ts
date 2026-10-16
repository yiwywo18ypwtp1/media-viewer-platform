import "server-only";
import { randomUUID } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { CurrentUser } from "@/features/auth/session";
import { ensureFolderPath, getFolderInProject } from "@/features/folders/queries";
import { getProjectAccess } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";
import { isUuid } from "@/lib/ids";
import { ApiError } from "@/server/api";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { getRequestId, requestLogger } from "@/server/request-log";
import { getMediaQueue } from "@/server/queues";
import { getPresignS3, getS3 } from "@/server/s3";
import { assets, assetVersions, reviewRequests, uploads } from "@/server/schema";
import {
  ALLOWED_MIME_TYPES,
  planParts,
  type completeUploadSchema,
  type CompleteUploadResponse,
  type createUploadSchema,
  type CreateUploadResponse,
  type presignPartsSchema,
  type PresignPartsResponse,
  type UploadStateResponse,
} from "./schema";

// Business logic behind /api/uploads/*. The bytes never pass through here:
// the browser PUTs parts straight to S3 with the presigned URLs we hand out.

const PART_URL_TTL_SECONDS = 15 * 60;

// Upload rights are checked on *every* call, not just at create: a member
// removed mid-upload must stop getting presigned URLs immediately.
async function requireUploadAccess(userId: string, projectId: string) {
  const access = await getProjectAccess(userId, projectId);
  if (!access) throw new ApiError(404, "not_found", "Project not found.");
  if (!can(access.role, "upload")) throw new ApiError(403, "forbidden", "You can't upload to this project.");
  return access;
}

async function getOwnUpload(userId: string, uploadId: string) {
  if (!isUuid(uploadId)) throw new ApiError(404, "not_found", "Upload not found.");
  const [upload] = await getDb()
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.userId, userId)))
    .limit(1);
  if (!upload) throw new ApiError(404, "not_found", "Upload not found.");
  await requireUploadAccess(userId, upload.projectId);
  return upload;
}

function partCountOf(upload: { size: number; partSize: number }) {
  return Math.ceil(upload.size / upload.partSize);
}

// "trailer_v2.final.mp4" -> "trailer_v2.final"
function assetNameFromFile(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export async function createUpload(
  user: CurrentUser,
  input: z.infer<typeof createUploadSchema>,
): Promise<CreateUploadResponse> {
  const access = await requireUploadAccess(user.id, input.projectId);
  const kind = ALLOWED_MIME_TYPES[input.mimeType];

  if (input.assetId) {
    const [asset] = await getDb()
      .select({ kind: assets.kind })
      .from(assets)
      .where(and(eq(assets.id, input.assetId), eq(assets.projectId, access.project.id)))
      .limit(1);
    if (!asset) throw new ApiError(404, "not_found", "Asset not found.");
    if (asset.kind !== kind) {
      throw new ApiError(400, "kind_mismatch", `A new version of a ${asset.kind} must also be a ${asset.kind}.`);
    }
  }

  // New assets only: a new version stays wherever its asset is.
  let folderId: string | null = null;
  if (!input.assetId) {
    if (input.folderId && !(await getFolderInProject(access.project.id, input.folderId))) {
      throw new ApiError(404, "not_found", "Folder not found.");
    }
    folderId = await ensureFolderPath(access.project.id, input.folderId, input.folderPath);
  }

  const { partSize } = planParts(input.size);
  const id = randomUUID();
  const s3Key = `originals/${id}`;

  const { UploadId } = await getS3()
    .send(new CreateMultipartUploadCommand({ Bucket: getEnv().S3_BUCKET, Key: s3Key, ContentType: input.mimeType }))
    .catch((error) => {
      logger.error({ err: error }, "S3 create multipart upload failed");
      throw new ApiError(503, "storage_unavailable", "File storage is unavailable. Try again in a minute.");
    });
  if (!UploadId) throw new Error("S3 did not return an UploadId");

  await getDb().insert(uploads).values({
    id,
    projectId: access.project.id,
    assetId: input.assetId,
    folderId,
    userId: user.id,
    fileName: input.fileName,
    size: input.size,
    mimeType: input.mimeType,
    s3Key,
    s3UploadId: UploadId,
    partSize,
  });

  (await requestLogger()).info({ uploadId: id, projectId: access.project.id, size: input.size }, "upload started");
  return { uploadId: id, partSize, partCount: partCountOf({ size: input.size, partSize }) };
}

// A reloaded page asks where its upload stands. The parts come from S3, not
// from the browser's notes: S3 is what "complete" will be checked against.
export async function getUploadState(user: CurrentUser, uploadId: string): Promise<UploadStateResponse> {
  const upload = await getOwnUpload(user.id, uploadId);
  const base = { status: upload.status, partSize: upload.partSize, partCount: partCountOf(upload) };
  if (upload.status !== "uploading") return { ...base, parts: [] };

  const parts: UploadStateResponse["parts"] = [];
  let marker: string | undefined;
  try {
    // ListParts pages at 1000 parts; a 5 GB file has at most 320 of 16 MiB.
    do {
      const page = await getS3().send(
        new ListPartsCommand({
          Bucket: getEnv().S3_BUCKET,
          Key: upload.s3Key,
          UploadId: upload.s3UploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? []) {
        if (part.PartNumber && part.ETag) parts.push({ partNumber: part.PartNumber, etag: part.ETag });
      }
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);
  } catch (error) {
    // Gone from S3 (expired by the stale-upload cleanup): nothing to resume.
    if (error instanceof Error && error.name === "NoSuchUpload") {
      await getDb().update(uploads).set({ status: "aborted" }).where(eq(uploads.id, upload.id));
      return { ...base, status: "aborted", parts: [] };
    }
    throw error;
  }
  return { ...base, parts };
}

export async function presignParts(
  user: CurrentUser,
  uploadId: string,
  input: z.infer<typeof presignPartsSchema>,
): Promise<PresignPartsResponse> {
  const upload = await getOwnUpload(user.id, uploadId);
  if (upload.status !== "uploading") throw new ApiError(409, "upload_closed", "This upload is no longer active.");

  const partCount = partCountOf(upload);
  if (input.partNumbers.some((n) => n > partCount)) {
    throw new ApiError(400, "invalid_part", `This upload has ${partCount} parts.`);
  }

  const urls = await Promise.all(
    input.partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        getPresignS3(),
        new UploadPartCommand({
          Bucket: getEnv().S3_BUCKET,
          Key: upload.s3Key,
          UploadId: upload.s3UploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: PART_URL_TTL_SECONDS },
      ),
    })),
  );
  return { urls };
}

export async function completeUpload(
  user: CurrentUser,
  uploadId: string,
  input: z.infer<typeof completeUploadSchema>,
): Promise<CompleteUploadResponse> {
  const upload = await getOwnUpload(user.id, uploadId);
  const db = getDb();
  const s3 = getS3();
  const bucket = getEnv().S3_BUCKET;

  // A repeated "complete" (e.g. the response got lost) returns the same version.
  if (upload.status === "completed" && upload.versionId) {
    return findCompleted(upload.versionId);
  }
  if (upload.status !== "uploading") throw new ApiError(409, "upload_closed", "This upload is no longer active.");
  if (input.parts.length !== partCountOf(upload)) {
    throw new ApiError(400, "parts_missing", "Not all parts were uploaded.");
  }

  try {
    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: upload.s3Key,
        UploadId: upload.s3UploadId,
        MultipartUpload: {
          Parts: [...input.parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    );
  } catch (error) {
    // NoSuchUpload after a successful S3 complete whose DB step failed:
    // the object exists, so carry on and let the size check decide.
    if (!(error instanceof Error && error.name === "NoSuchUpload")) {
      logger.warn({ err: error, uploadId }, "complete multipart upload failed");
      throw new ApiError(400, "upload_incomplete", "Some parts are missing or damaged. Retry the upload.");
    }
  }

  // The server's own check of what actually landed in S3 (task 3.2). The
  // SHA-256 is verified by the worker, which streams the file anyway.
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: upload.s3Key })).catch(() => null);
  if (!head || head.ContentLength !== upload.size) {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: upload.s3Key })).catch(() => {});
    await db.update(uploads).set({ status: "aborted" }).where(eq(uploads.id, upload.id));
    throw new ApiError(400, "size_mismatch", "The stored file size doesn't match. Upload the file again.");
  }

  const result = await db.transaction(async (tx) => {
    // Row lock: two concurrent completes of one upload create one version.
    const [locked] = await tx.select().from(uploads).where(eq(uploads.id, upload.id)).for("update");
    if (locked.status === "completed" && locked.versionId) return { versionId: locked.versionId, created: false };

    let assetId = locked.assetId;
    let number = 1;
    if (assetId) {
      // Lock the asset so two new versions uploaded at once get different numbers.
      await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId)).for("update");
      const [latest] = await tx
        .select({ max: sql`coalesce(max(${assetVersions.number}), 0)`.mapWith(Number) })
        .from(assetVersions)
        .where(eq(assetVersions.assetId, assetId));
      number = latest.max + 1;
      // A new version is back in review, and a review running on an older
      // version no longer reviews the latest: it becomes stale (the asset
      // page offers to restart it on the new version).
      await tx.update(assets).set({ updatedAt: new Date(), status: "in_review" }).where(eq(assets.id, assetId));
      await tx
        .update(reviewRequests)
        .set({ status: "stale", completedAt: new Date() })
        .where(and(eq(reviewRequests.assetId, assetId), eq(reviewRequests.status, "active")));
    } else {
      const [asset] = await tx
        .insert(assets)
        .values({
          projectId: locked.projectId,
          folderId: locked.folderId,
          name: assetNameFromFile(locked.fileName),
          kind: ALLOWED_MIME_TYPES[locked.mimeType as keyof typeof ALLOWED_MIME_TYPES],
        })
        .returning({ id: assets.id });
      assetId = asset.id;
    }

    const [version] = await tx
      .insert(assetVersions)
      .values({
        assetId,
        number,
        uploadedBy: locked.userId,
        originalKey: locked.s3Key,
        originalSize: locked.size,
        originalMime: locked.mimeType,
        originalChecksum: input.sha256,
      })
      .returning({ id: assetVersions.id });

    await tx.update(uploads).set({ status: "completed", versionId: version.id }).where(eq(uploads.id, locked.id));
    return { versionId: version.id, created: true };
  });

  if (result.created) {
    (await requestLogger()).info({ uploadId, versionId: result.versionId }, "upload completed, version created");
    try {
      await getMediaQueue().add(
        "process",
        { versionId: result.versionId, requestId: await getRequestId() },
        { jobId: result.versionId },
      );
    } catch (error) {
      // The version is saved as "pending"; the worker's sweeper re-enqueues
      // pending versions, so a Redis blip here doesn't lose the job.
      logger.error({ err: error, versionId: result.versionId }, "failed to enqueue media job");
    }
  }

  return findCompleted(result.versionId);
}

async function findCompleted(versionId: string): Promise<CompleteUploadResponse> {
  const [version] = await getDb()
    .select({ assetId: assetVersions.assetId })
    .from(assetVersions)
    .where(eq(assetVersions.id, versionId))
    .limit(1);
  return { assetId: version.assetId, versionId };
}

export async function abortUpload(user: CurrentUser, uploadId: string) {
  const upload = await getOwnUpload(user.id, uploadId);
  if (upload.status !== "uploading") return;

  await getS3()
    .send(
      new AbortMultipartUploadCommand({
        Bucket: getEnv().S3_BUCKET,
        Key: upload.s3Key,
        UploadId: upload.s3UploadId,
      }),
    )
    .catch((error) => {
      if (!(error instanceof Error && error.name === "NoSuchUpload")) throw error;
    });
  await getDb().update(uploads).set({ status: "aborted" }).where(eq(uploads.id, upload.id));
}
