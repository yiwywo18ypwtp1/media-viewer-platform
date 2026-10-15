import { updateCommentSchema } from "@/features/comments/schema";
import { deleteComment, updateComment } from "@/features/comments/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// PATCH /api/comments/:id (If-Match: "<revision>") -> edit body, or resolve/reopen
export async function PATCH(request: Request, ctx: RouteContext<"/api/comments/[id]">) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, updateCommentSchema);
    const comment = await updateComment(user, (await ctx.params).id, request.headers.get("if-match"), input);
    return Response.json(comment, { headers: { ETag: `"${comment.revision}"` } });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/comments/:id (If-Match: "<revision>")
export async function DELETE(request: Request, ctx: RouteContext<"/api/comments/[id]">) {
  try {
    const user = await requireApiUser();
    await deleteComment(user, (await ctx.params).id, request.headers.get("if-match"));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
