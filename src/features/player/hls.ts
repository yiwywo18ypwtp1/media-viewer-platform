import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, isNotNull } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { ApiError } from "@/server/api";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { getS3, presignGetUrl } from "@/server/s3";
import { assetVersions } from "@/server/schema";

// Serves one version's HLS files to a viewer whose access the route has
// already checked. Playlists are a few KB of text: served from here, as
// stored, so the relative segment paths inside them point back at this
// route. Segments (the actual video) are never proxied: each request gets a
// 302 to a presigned S3 URL that lives only SEGMENT_URL_TTL_SECONDS.
//
// Why not presigned URLs written into the playlist? They'd all expire
// together mid-viewing, and a revoked viewer could keep using them. This
// way every segment re-checks access, and URLs never need refreshing.

const SEGMENT_URL_TTL_SECONDS = 60;
// "master.m3u8", "720p/index.m3u8", "720p/seg_004.m4s", "audio/init_2.mp4"
const SAFE_PART = /^[\w-]+(\.[\w]+)?$/;

export async function hlsResponse(assetId: string, versionId: string, path: string[]): Promise<Response> {
  if (!isUuid(versionId) || path.length === 0 || path.length > 2 || !path.every((part) => SAFE_PART.test(part))) {
    throw new ApiError(404, "not_found", "Not found.");
  }
  const [version] = await getDb()
    .select({ id: assetVersions.id })
    .from(assetVersions)
    .where(and(eq(assetVersions.id, versionId), eq(assetVersions.assetId, assetId), isNotNull(assetVersions.hlsKey)))
    .limit(1);
  if (!version) throw new ApiError(404, "not_found", "Not found.");

  const key = `versions/${version.id}/hls/${path.join("/")}`;
  if (key.endsWith(".m3u8")) {
    const object = await getS3()
      .send(new GetObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }))
      .catch(() => null);
    if (!object?.Body) throw new ApiError(404, "not_found", "Not found.");
    return new Response(await object.Body.transformToString(), {
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-cache" },
    });
  }
  return new Response(null, {
    status: 302,
    headers: { Location: await presignGetUrl(key, SEGMENT_URL_TTL_SECONDS), "Cache-Control": "no-store" },
  });
}
