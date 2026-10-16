import { createGuestComment } from "@/features/comments/server";
import { guestCommentSchema } from "@/features/share-links/schema";
import { requireShareAccess } from "@/features/share-links/server";
import { ApiError, errorResponse, readJson } from "@/server/api";

// POST /s/:token/comments -> a guest's comment, if the link allows comments.
export async function POST(request: Request, ctx: RouteContext<"/s/[token]/comments">) {
  try {
    const { link, asset, version } = await requireShareAccess((await ctx.params).token);
    if (!link.allowComments) throw new ApiError(403, "forbidden", "Comments are off for this link.");
    const input = await readJson(request, guestCommentSchema);
    const comment = await createGuestComment(
      link,
      { ...version, assetId: asset.id, assetName: asset.name, kind: asset.kind, projectId: asset.projectId },
      { ...input, mentions: [] },
    );
    return Response.json(comment, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
