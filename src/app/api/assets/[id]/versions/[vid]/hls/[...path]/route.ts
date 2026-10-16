import { getAssetAccess } from "@/features/assets/queries";
import { hlsResponse } from "@/features/player/hls";
import { ApiError, errorResponse, requireApiUser } from "@/server/api";

// GET /api/assets/:id/versions/:vid/hls/<file> -> playlist text, or a 302 to
// a presigned segment URL. Access is checked on every request (every segment).
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[id]/versions/[vid]/hls/[...path]">) {
  try {
    const user = await requireApiUser();
    const { id, vid, path } = await ctx.params;
    const access = await getAssetAccess(user.id, id);
    if (!access) throw new ApiError(404, "not_found", "Asset not found.");
    return await hlsResponse(access.asset.id, vid, path);
  } catch (error) {
    return errorResponse(error);
  }
}
