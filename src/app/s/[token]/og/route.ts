import { getShareAccess } from "@/features/share-links/server";
import { presignGetUrl } from "@/server/s3";

// GET /s/:token/og -> the poster, for link previews (Open Graph). Only for
// links without a password: a preview must not leak what the password guards.
export async function GET(_request: Request, ctx: RouteContext<"/s/[token]/og">) {
  const access = await getShareAccess((await ctx.params).token);
  if (!access || access.link.passwordHash || !access.version.posterKey) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: await presignGetUrl(access.version.posterKey, 5 * 60), "Cache-Control": "no-store" },
  });
}
