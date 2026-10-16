import { revokeShareLink } from "@/features/share-links/server";
import { errorResponse, requireApiUser } from "@/server/api";

// DELETE /api/share-links/:id -> revoke. Effective on the guest's next request.
export async function DELETE(_request: Request, ctx: RouteContext<"/api/share-links/[id]">) {
  try {
    const user = await requireApiUser();
    await revokeShareLink(user, (await ctx.params).id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
