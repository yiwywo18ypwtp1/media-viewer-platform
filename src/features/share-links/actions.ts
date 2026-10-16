"use server";

import { actionError, validationFailed, type ActionResult } from "@/lib/action-result";
import { unlockSchema } from "./schema";
import { unlockShareLink } from "./server";

// The password form on /s/<token>. Public: no member session involved.
export async function unlock(token: unknown, values: unknown): Promise<ActionResult> {
  const parsed = unlockSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);
  if (typeof token !== "string") return actionError("not_found", "This link is not available.");

  const result = await unlockShareLink(token, parsed.data.password);
  if (result.ok) return { ok: true };
  return actionError(result.code, result.message, result.code === "wrong_password" ? { password: result.message } : undefined);
}
