import { createUploadSchema } from "@/features/uploads/schema";
import { createUpload } from "@/features/uploads/server";
import { errorResponse, readJson, requireApiUser } from "@/server/api";

// POST /api/uploads -> start a multipart upload: { uploadId, partSize, partCount }
export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const input = await readJson(request, createUploadSchema);
    return Response.json(await createUpload(user, input), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
