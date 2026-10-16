import { createShareLinkSchema } from "@/features/share-links/schema";
import { createShareLink } from "@/features/share-links/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// POST /api/share-links -> { id, url }. The URL (with the token) is returned
// only here, once: the server keeps just the token's hash.
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, createShareLinkSchema);
    return Response.json(await createShareLink(user, input), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
