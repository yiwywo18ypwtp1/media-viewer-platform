import { createCommentSchema } from "@/features/comments/schema";
import { createComment, getVersionAccess, listComments } from "@/features/comments/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// GET /api/versions/:vid/comments?cursor=... -> { comments, nextCursor }
export async function GET(request: Request, ctx: RouteContext<"/api/versions/[vid]/comments">) {
  try {
    const user = await requireApiUser();
    const { version } = await getVersionAccess(user.id, (await ctx.params).vid);
    const cursor = new URL(request.url).searchParams.get("cursor");
    return Response.json(await listComments(version.id, cursor));
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/versions/:vid/comments -> the created comment, with its ETag
export async function POST(request: Request, ctx: RouteContext<"/api/versions/[vid]/comments">) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, createCommentSchema);
    const comment = await createComment(user, (await ctx.params).vid, input);
    return Response.json(comment, { status: 201, headers: { ETag: `"${comment.revision}"` } });
  } catch (error) {
    return errorResponse(error);
  }
}
