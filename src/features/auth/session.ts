import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { sessions, users } from "@/server/schema";
import { generateToken, hashToken } from "@/server/tokens";
import { SESSION_COOKIE } from "./cookie";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CurrentUser = { id: string; email: string; name: string };

export async function createSession(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const db = getDb();

  // Housekeeping: drop this user's expired sessions while we're here.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Lax: sent on top-level navigation from other sites, not on their POSTs.
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

// cache(): layout, page and data functions in one render share a single query.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [user] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return user ?? null;
});

// The real auth check. proxy.ts only looks at cookie presence.
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function deleteCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  cookieStore.delete(SESSION_COOKIE);
}
