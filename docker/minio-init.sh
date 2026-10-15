#!/bin/sh
# One-shot: creates the bucket. Safe to re-run.
#
# CORS and cleanup of abandoned multipart uploads are configured on the MinIO
# server itself (MINIO_API_CORS_ALLOW_ORIGIN, MINIO_API_STALE_UPLOADS_EXPIRY in
# docker-compose.yml): MinIO does not implement bucket-level PutBucketCors or the
# AbortIncompleteMultipartUpload lifecycle action.
set -eu

# mc keeps its config in $HOME; the image's user has no writable home.
export HOME=/tmp

mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
mc mb --ignore-existing "local/$S3_BUCKET"
# Objects are only reachable through presigned URLs.
mc anonymous set none "local/$S3_BUCKET"

echo "minio-init: bucket '$S3_BUCKET' ready"
