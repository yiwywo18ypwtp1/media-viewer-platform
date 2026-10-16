import { hlsResponse } from "@/features/player/hls";
import { requireShareAccess } from "@/features/share-links/server";
import { errorResponse } from "@/server/api";

// GET /s/:token/hls/<file>: the link is checked on every playlist and segment,
// so a revoked link stops playback within one segment (plus what's buffered).
export async function GET(_request: Request, ctx: RouteContext<"/s/[token]/hls/[...path]">) {
  try {
    const { token, path } = await ctx.params;
    const { asset, version } = await requireShareAccess(token);
    return await hlsResponse(asset.id, version.id, path);
  } catch (error) {
    return errorResponse(error);
  }
}
