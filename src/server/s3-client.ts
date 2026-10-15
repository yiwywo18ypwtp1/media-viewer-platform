import { S3Client } from "@aws-sdk/client-s3";

// Env-free factory shared by web and worker; each process passes its own config.
export function createS3Client(config: {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
}) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    // MinIO serves buckets as /bucket/key, not bucket.host/key.
    forcePathStyle: true,
  });
}
