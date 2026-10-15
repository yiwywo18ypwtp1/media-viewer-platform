import { getAssetAccess, listVersions } from "@/features/assets/queries";
import { ApiError, errorResponse, requireApiUser } from "@/server/api";

// GET /api/assets/:id -> the asset with its version stack (newest first)
export async function GET(_request: Request, ctx: RouteContext<"/api/assets/[id]">) {
  try {
    const user = await requireApiUser();
    const access = await getAssetAccess(user.id, (await ctx.params).id);
    if (!access) throw new ApiError(404, "not_found", "Asset not found.");
    return Response.json({ asset: access.asset, versions: await listVersions(access.asset.id) });
  } catch (error) {
    return errorResponse(error);
  }
}
