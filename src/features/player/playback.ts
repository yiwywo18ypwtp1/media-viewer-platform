import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db";
import { presignGetUrl } from "@/server/s3";
import { assetVersions } from "@/server/schema";
import type { SpriteInfo } from "./sprite";

// Short-lived URLs for playing one version in the browser. The player asks
// for fresh ones (GET .../playback) when they expire mid-session.
const PLAYBACK_TTL_SECONDS = 10 * 60;

export type PlaybackUrls = {
  // HLS master playlist on our own route (see hls.ts). It doesn't expire:
  // every segment request is checked and signed on its own.
  hlsUrl: string | null;
  videoUrl: string | null; // 720p MP4: fallback where HLS can't play
  imageUrl: string | null; // large WebP (images)
  posterUrl: string | null;
  sprite: (SpriteInfo & { url: string; key?: undefined }) | null;
  expiresAt: string;
};

type Options = {
  // Where the HLS route for this viewer lives (members and share links differ).
  hlsBase?: string;
  ttlSeconds?: number;
};

// Caller has checked access to the asset. Returns null if the version isn't
// part of that asset or isn't processed yet.
export async function getPlaybackUrls(
  assetId: string,
  versionId: string,
  options: Options = {},
): Promise<PlaybackUrls | null> {
  const [version] = await getDb()
    .select({
      state: assetVersions.processingState,
      mp4Key: assetVersions.mp4Key,
      previewKey: assetVersions.previewKey,
      posterKey: assetVersions.posterKey,
      hlsKey: assetVersions.hlsKey,
      sprite: assetVersions.sprite,
    })
    .from(assetVersions)
    .where(and(eq(assetVersions.id, versionId), eq(assetVersions.assetId, assetId)))
    .limit(1);
  if (!version || version.state !== "ready") return null;

  const ttl = options.ttlSeconds ?? PLAYBACK_TTL_SECONDS;
  const sign = (key: string | null | undefined) => (key ? presignGetUrl(key, ttl) : null);
  const [videoUrl, imageUrl, posterUrl, spriteUrl] = await Promise.all([
    sign(version.mp4Key),
    sign(version.previewKey),
    sign(version.posterKey),
    sign(version.sprite?.key),
  ]);
  const hlsBase = options.hlsBase ?? `/api/assets/${assetId}/versions/${versionId}/hls`;
  return {
    hlsUrl: version.hlsKey ? `${hlsBase}/master.m3u8` : null,
    videoUrl,
    imageUrl,
    posterUrl,
    // The storage key stays on the server; the page gets the signed URL.
    sprite: version.sprite && spriteUrl ? { ...version.sprite, key: undefined, url: spriteUrl } : null,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}
