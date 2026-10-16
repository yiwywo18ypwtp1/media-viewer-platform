import { requireShareAccess } from "@/features/share-links/server";
import { errorResponse } from "@/server/api";

// GET /s/:token/status -> 204 while the link works, 404 once it doesn't. The
// guest page polls it, so a revoke stops an open page even when the whole
// video is already buffered.
export async function GET(_request: Request, ctx: RouteContext<"/s/[token]/status">) {
  try {
    await requireShareAccess((await ctx.params).token);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
