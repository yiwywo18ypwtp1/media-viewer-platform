import { S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "./env";

function createS3() {
  const env = getEnv();
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    // MinIO serves buckets as /bucket/key, not bucket.host/key.
    forcePathStyle: true,
  });
}

const globalForS3 = globalThis as unknown as { s3?: S3Client };

export function getS3() {
  globalForS3.s3 ??= createS3();
  return globalForS3.s3;
}
