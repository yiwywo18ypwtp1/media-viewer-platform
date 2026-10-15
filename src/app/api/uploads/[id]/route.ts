import { abortUpload } from "@/features/uploads/server";
import { errorResponse, requireApiUser } from "@/server/api";

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
