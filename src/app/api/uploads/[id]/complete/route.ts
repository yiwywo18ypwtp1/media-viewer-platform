import { completeUploadSchema } from "@/features/uploads/schema";
import { completeUpload } from "@/features/uploads/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// POST /api/uploads/:id/complete { parts, sha256 } -> { assetId, versionId }
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[id]/complete">) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, completeUploadSchema);
    return Response.json(await completeUpload(user, (await ctx.params).id, input));
  } catch (error) {
    return errorResponse(error);
  }
}
