import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { presignGetUrl } from "@/server/s3";
import { assetVersions } from "@/server/schema";

// Short-lived URLs for playing one version in the browser. The player asks
// for fresh ones (GET .../playback) when they expire mid-session.
const PLAYBACK_TTL_SECONDS = 10 * 60;

export type PlaybackUrls = {
  videoUrl: string | null; // 720p MP4 (videos)
  imageUrl: string | null; // large WebP (images)
  posterUrl: string | null;
  expiresAt: string;
};

// Caller has checked access to the asset. Returns null if the version isn't
// part of that asset or isn't processed yet.
export async function getPlaybackUrls(assetId: string, versionId: string): Promise<PlaybackUrls | null> {
  const [version] = await getDb()
    .select({
      state: assetVersions.processingState,
      mp4Key: assetVersions.mp4Key,
      previewKey: assetVersions.previewKey,
      posterKey: assetVersions.posterKey,
    })
    .from(assetVersions)
    .where(and(eq(assetVersions.id, versionId), eq(assetVersions.assetId, assetId)))
    .limit(1);
  if (!version || version.state !== "ready") return null;

  const sign = (key: string | null) => (key ? presignGetUrl(key, PLAYBACK_TTL_SECONDS) : null);
  const [videoUrl, imageUrl, posterUrl] = await Promise.all([
    sign(version.mp4Key),
    sign(version.previewKey),
    sign(version.posterKey),
  ]);
  return {
    videoUrl,
    imageUrl,
    posterUrl,
    expiresAt: new Date(Date.now() + PLAYBACK_TTL_SECONDS * 1000).toISOString(),
  };
}
