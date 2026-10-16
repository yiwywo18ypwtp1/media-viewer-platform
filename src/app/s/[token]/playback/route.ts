import { getPlaybackUrls } from "@/features/player/playback";
import { GUEST_URL_TTL_SECONDS } from "@/features/share-links/link-state";
import { requireShareAccess, sharePath } from "@/features/share-links/server";
import { ApiError, errorResponse } from "@/server/api";

// GET /s/:token/playback -> short-lived media URLs for the link's version
export async function GET(_request: Request, ctx: RouteContext<"/s/[token]/playback">) {
  try {
    const { token } = await ctx.params;
    const { asset, version } = await requireShareAccess(token);
    const urls = await getPlaybackUrls(asset.id, version.id, {
      hlsBase: `${sharePath(token)}/hls`,
      ttlSeconds: GUEST_URL_TTL_SECONDS,
    });
    if (!urls) throw new ApiError(409, "not_ready", "This version isn't ready to play.");
    return Response.json(urls, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
