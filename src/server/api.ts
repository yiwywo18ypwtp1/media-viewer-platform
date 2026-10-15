import "server-only";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/features/auth/session";
import { logger } from "./logger";

// Route Handler helpers. All API errors use one shape (task section 4):
//   { error: { code, message, fieldErrors?, details? } }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } },
      { status: error.status },
    );
  }
  logger.error({ err: error }, "unhandled API error");
  return Response.json({ error: { code: "internal_error", message: "Something went wrong." } }, { status: 500 });
}

export async function requireApiUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "unauthorized", "Sign in required.");
  return user;
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  const body: unknown = await request.json().catch(() => {
    throw new ApiError(400, "invalid_json", "Request body must be JSON.");
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    throw new ApiError(400, "validation_failed", "The request is invalid.", fieldErrors);
  }
  return parsed.data;
}
