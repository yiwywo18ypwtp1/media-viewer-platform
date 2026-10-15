import { presignPartsSchema } from "@/features/uploads/schema";
import { presignParts } from "@/features/uploads/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// POST /api/uploads/:id/parts { partNumbers } -> presigned PUT URLs, in a batch
export async function POST(request: Request, ctx: RouteContext<"/api/uploads/[id]/parts">) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, presignPartsSchema);
    return Response.json(await presignParts(user, (await ctx.params).id, input));
  } catch (error) {
    return errorResponse(error);
  }
}
