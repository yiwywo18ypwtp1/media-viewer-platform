import type { z } from "zod";

// What Server Actions return for expected failures. Unexpected errors are
// thrown and handled by the nearest error.tsx instead.
export type ActionError = {
  code: string;
  message: string;
  // First message per field, keyed by field path ("steps.0.rule").
  fieldErrors?: Record<string, string>;
};

export type ActionResult = { ok: true } | { ok: false; error: ActionError };

export function actionError(
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): ActionResult {
  return { ok: false, error: { code, message, fieldErrors } };
}

export function validationFailed(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    fieldErrors[issue.path.join(".")] ??= issue.message;
  }
  return actionError("validation_failed", "Check the highlighted fields.", fieldErrors);
}
