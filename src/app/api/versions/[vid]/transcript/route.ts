import { getVersionAccess } from "@/features/comments/server";
import { searchTranscript } from "@/features/transcripts/queries";
import { errorResponse, requireApiUser } from "@/server/api";

// GET /api/versions/:vid/transcript?q=... -> transcript lines (matching q, if given)
export async function GET(request: Request, ctx: RouteContext<"/api/versions/[vid]/transcript">) {
  try {
    const user = await requireApiUser();
    const { version } = await getVersionAccess(user.id, (await ctx.params).vid);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    return Response.json({ lines: await searchTranscript(version.id, query.slice(0, 200)) });
  } catch (error) {
    return errorResponse(error);
  }
}
