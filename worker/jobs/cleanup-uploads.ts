import { AbortMultipartUploadCommand, type S3Client } from "@aws-sdk/client-s3";
import { and, eq, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Logger } from "pino";
import * as schema from "../../src/server/schema";

// Aborts multipart uploads nobody finished (tab closed, network gone) so their
// parts stop taking space. MinIO's own stale-upload expiry is the safety net;
// this job also keeps our `uploads` table honest.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function createCleanupUploads(deps: {
  db: PostgresJsDatabase<typeof schema>;
  s3: S3Client;
  bucket: string;
  log: Logger;
}) {
  return async function cleanupUploads() {
    const { uploads } = schema;
    const stale = await deps.db
      .select({ id: uploads.id, s3Key: uploads.s3Key, s3UploadId: uploads.s3UploadId })
      .from(uploads)
      .where(and(eq(uploads.status, "uploading"), lt(uploads.createdAt, new Date(Date.now() - STALE_AFTER_MS))))
      .limit(500);

    for (const upload of stale) {
      await deps.s3
        .send(new AbortMultipartUploadCommand({ Bucket: deps.bucket, Key: upload.s3Key, UploadId: upload.s3UploadId }))
        .catch((error) => {
          // Already gone (MinIO expired it, or a user abort raced us): fine.
          if (!(error instanceof Error && error.name === "NoSuchUpload")) throw error;
        });
      await deps.db
        .update(uploads)
        .set({ status: "aborted" })
        .where(and(eq(uploads.id, upload.id), eq(uploads.status, "uploading")));
    }

    deps.log.info({ aborted: stale.length }, "abandoned uploads cleaned up");
  };
}
