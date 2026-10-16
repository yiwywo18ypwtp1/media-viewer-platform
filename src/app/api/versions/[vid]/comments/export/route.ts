import { exportCommentsCsv } from "@/features/comments/export";
import { errorResponse, requireApiUser } from "@/server/api";

// GET /api/versions/:vid/comments/export -> all comments of the version as a CSV file
export async function GET(_request: Request, ctx: RouteContext<"/api/versions/[vid]/comments/export">) {
  try {
    const user = await requireApiUser();
    const { csv, fileName } = await exportCommentsCsv(user, (await ctx.params).vid);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
