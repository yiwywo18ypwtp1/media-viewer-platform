import { decisionSchema } from "@/features/reviews/schema";
import { decide } from "@/features/reviews/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// POST /api/review-requests/:id/decisions (Idempotency-Key: <unique per attempt>)
// -> { id, status, currentStep }. Retrying with the same key returns the same
// result without recording a second decision.
export async function POST(request: Request, ctx: RouteContext<"/api/review-requests/[id]/decisions">) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, decisionSchema);
    return Response.json(
      await decide(user, (await ctx.params).id, request.headers.get("idempotency-key"), input),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
