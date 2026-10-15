"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { actionError, validationFailed, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/server/db";
import { passwordResetEmail } from "@/server/emails";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { hashPassword, verifyPassword } from "@/server/password";
import { getEmailQueue } from "@/server/queues";
import { passwordResets, sessions, users } from "@/server/schema";
import { generateToken, hashToken } from "@/server/tokens";
import { safeNextPath } from "./next-path";
import { PASSWORD_RESET_TTL_MS } from "./queries";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./schema";
import { createSession, deleteCurrentSession } from "./session";

// Every action takes `unknown` and validates with the same schema the form uses:
// a Server Action is a public endpoint, the client can send anything.

export async function register(values: unknown, next: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);
  const { name, email, password } = parsed.data;

  // ON CONFLICT instead of "select, then insert": two parallel sign-ups with
  // the same email can't both pass.
  const [user] = await getDb()
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password) })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  if (!user) {
    return actionError("email_taken", "This email is already registered.", {
      email: "An account with this email already exists.",
    });
  }

  await createSession(user.id);
  redirect(safeNextPath(next));
}

let dummyHash: Promise<string> | undefined;

export async function login(values: unknown, next: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);
  const { email, password } = parsed.data;

  const [user] = await getDb()
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Hash even when the user doesn't exist, so response time doesn't reveal
  // which emails are registered.
  dummyHash ??= hashPassword("timing-equalizer");
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await dummyHash));

  if (!user || !passwordMatches) {
    return actionError("invalid_credentials", "Wrong email or password.");
  }

  await createSession(user.id);
  redirect(safeNextPath(next));
}

export async function logout() {
  await deleteCurrentSession();
  redirect("/login");
}

export async function requestPasswordReset(values: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);

  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  // Same answer whether or not the account exists (no account enumeration).
  if (!user) return { ok: true };

  const token = generateToken();
  await getDb()
    .insert(passwordResets)
    .values({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });

  try {
    const url = `${getEnv().APP_URL}/reset-password/${token}`;
    await getEmailQueue().add("password-reset", passwordResetEmail({ to: user.email, name: user.name, url }));
  } catch (error) {
    logger.error({ err: error }, "failed to enqueue password reset email");
    return actionError("email_unavailable", "We couldn't send the email right now. Try again in a minute.");
  }

  return { ok: true };
}

export async function resetPassword(values: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);

  const tokenHash = hashToken(parsed.data.token);
  // Hash before the transaction: scrypt is slow and shouldn't hold row locks.
  const passwordHash = await hashPassword(parsed.data.password);

  const userId = await getDb().transaction(async (tx) => {
    // Consume the token atomically: only one request can flip used_at from NULL,
    // so the link works exactly once even under concurrent submits.
    const [reset] = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      )
      .returning({ userId: passwordResets.userId });
    if (!reset) return null;

    await tx.update(users).set({ passwordHash }).where(eq(users.id, reset.userId));
    // Other reset links for this user stop working too.
    await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.userId, reset.userId), isNull(passwordResets.usedAt)));
    // Signs out every device: whoever knew the old password loses access.
    await tx.delete(sessions).where(eq(sessions.userId, reset.userId));
    return reset.userId;
  });

  if (!userId) {
    return actionError("invalid_token", "This link is invalid or has expired. Request a new one.");
  }

  await createSession(userId);
  redirect("/");
}
