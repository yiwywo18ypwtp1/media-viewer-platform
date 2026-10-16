import { abortUpload, getUploadState } from "@/features/uploads/server";
import { errorResponse, requireApiUser } from "@/server/api";

// GET /api/uploads/:id -> status and the parts S3 already has (resume after reload)
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  try {
    const user = await requireApiUser();
    return Response.json(await getUploadState(user, (await ctx.params).id));
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/uploads/:id -> abort the multipart upload
export async function DELETE(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  try {
    const user = await requireApiUser();
    await abortUpload(user, (await ctx.params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
