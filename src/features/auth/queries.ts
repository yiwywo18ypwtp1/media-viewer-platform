import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/server/db";
import { passwordResets } from "@/server/schema";
import { hashToken } from "@/server/tokens";

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

// Lets the reset page show "link expired" before the user types a new password.
// The action re-checks atomically, so this is a UX check, not the security one.
export async function isPasswordResetTokenUsable(token: string): Promise<boolean> {
  const [reset] = await getDb()
    .select({ userId: passwordResets.userId })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(reset);
}
