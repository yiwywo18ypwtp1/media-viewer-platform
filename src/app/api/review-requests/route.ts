import { createReviewRequestSchema } from "@/features/reviews/schema";
import { createReviewRequest } from "@/features/reviews/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// POST /api/review-requests -> { id }
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, createReviewRequestSchema);
    return Response.json(await createReviewRequest(user, input), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
