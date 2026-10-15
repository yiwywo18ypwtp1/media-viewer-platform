import { getAssetAccess } from "@/features/assets/queries";
import { getPlaybackUrls } from "@/features/player/playback";
import { ApiError, errorResponse, requireApiUser } from "@/server/api";

// GET /api/assets/:id/versions/:vid/playback -> short-lived media URLs.
// Access is checked on every call, so a removed member can't mint new URLs.
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[id]/versions/[vid]/playback">) {
  try {
    const user = await requireApiUser();
    const { id, vid } = await ctx.params;
    const access = await getAssetAccess(user.id, id);
    if (!access) throw new ApiError(404, "not_found", "Asset not found.");

    const urls = await getPlaybackUrls(access.asset.id, vid);
    if (!urls) throw new ApiError(409, "not_ready", "This version isn't ready to play.");
    return Response.json(urls, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
