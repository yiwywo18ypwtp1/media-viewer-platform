import type { S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "./env";
import { createS3Client } from "./s3-client";

const globalForS3 = globalThis as unknown as { s3?: S3Client; presignS3?: S3Client };

// For server-to-MinIO calls (create/complete multipart, HEAD, delete).
export function getS3() {
  const env = getEnv();
  globalForS3.s3 ??= createS3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });
  return globalForS3.s3;
}

// For presigning URLs the *browser* will call. The host is part of the
// signature, so it must be the public address (localhost:9000), not the
// in-network one (minio:9000). Presigning is local math: no request is made.
export function getPresignS3() {
  const env = getEnv();
  globalForS3.presignS3 ??= createS3Client({
    endpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });
  return globalForS3.presignS3;
}
