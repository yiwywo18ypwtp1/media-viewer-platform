import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { z } from "zod";
import { getAssetAccess } from "@/features/assets/queries";
import type { CurrentUser } from "@/features/auth/session";
import { can } from "@/features/workspaces/roles";
import { isUuid } from "@/lib/ids";
import { ApiError } from "@/server/api";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { verifyPassword, hashPassword } from "@/server/password";
import { countFailure, isLimited, RATE_LIMIT_WINDOW_MINUTES } from "@/server/rate-limit";
import { assets, assetVersions, projects, shareLinks, shareLinkSessions, users } from "@/server/schema";
import { generateToken, hashToken } from "@/server/tokens";
import { ATTEMPTS_PER_IP, ATTEMPTS_PER_LINK, guestSessionExpiry, isWellFormedToken, linkState } from "./link-state";
import type { createShareLinkSchema, ShareLinkSummary } from "./schema";

// Public links /s/<token>. Members create and revoke them; guests reach one
// asset through them, with no account. Every guest request (page, playlist,
// each video segment, comment) goes through getShareAccess, which re-reads
// the link: revoking takes effect on the next request.

// The unlocked-guest cookie is scoped to the link's own path, so each link
// has its own and none of them is sent anywhere else.
const GUEST_COOKIE = "share_session";
export const sharePath = (token: string) => `/s/${token}`;

// --- Members: create, revoke, list ---

export async function createShareLink(user: CurrentUser, input: z.infer<typeof createShareLinkSchema>) {
  const access = await getAssetAccess(user.id, input.assetId);
  if (!access) throw new ApiError(404, "not_found", "Asset not found.");
  if (!can(access.role, "share")) throw new ApiError(403, "forbidden", "You can't share this asset.");
  if (input.versionId) {
    const [version] = await getDb()
      .select({ id: assetVersions.id })
      .from(assetVersions)
      .where(and(eq(assetVersions.id, input.versionId), eq(assetVersions.assetId, access.asset.id)))
      .limit(1);
    if (!version) throw new ApiError(400, "validation_failed", "Pick a version of this asset.", { versionId: "Unknown version." });
  }

  const token = generateToken();
  const [link] = await getDb()
    .insert(shareLinks)
    .values({
      assetId: access.asset.id,
      versionId: input.versionId,
      tokenHash: hashToken(token),
      createdBy: user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      passwordHash: input.password ? await hashPassword(input.password) : null,
      allowDownload: input.allowDownload,
      allowComments: input.allowComments,
    })
    .returning({ id: shareLinks.id });
  // The only time the token leaves the server: we keep just its hash.
  return { id: link.id, url: `${getEnv().APP_URL}${sharePath(token)}` };
}

export async function revokeShareLink(user: CurrentUser, linkId: string) {
  if (!isUuid(linkId)) throw new ApiError(404, "not_found", "Link not found.");
  const db = getDb();
  const [link] = await db.select({ assetId: shareLinks.assetId }).from(shareLinks).where(eq(shareLinks.id, linkId)).limit(1);
  const access = link && (await getAssetAccess(user.id, link.assetId));
  if (!access) throw new ApiError(404, "not_found", "Link not found.");
  if (!can(access.role, "share")) throw new ApiError(403, "forbidden", "You can't manage links here.");

  await db.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.id, linkId), isNull(shareLinks.revokedAt)));
  // Not needed for safety (every request checks the link), just tidy.
  await db.delete(shareLinkSessions).where(eq(shareLinkSessions.shareLinkId, linkId));
}

export async function listShareLinks(assetId: string): Promise<ShareLinkSummary[]> {
  const rows = await getDb()
    .select({
      id: shareLinks.id,
      versionNumber: assetVersions.number,
      expiresAt: shareLinks.expiresAt,
      passwordHash: shareLinks.passwordHash,
      allowDownload: shareLinks.allowDownload,
      allowComments: shareLinks.allowComments,
      revokedAt: shareLinks.revokedAt,
      createdAt: shareLinks.createdAt,
      createdBy: users.name,
    })
    .from(shareLinks)
    .leftJoin(assetVersions, eq(assetVersions.id, shareLinks.versionId))
    .innerJoin(users, eq(users.id, shareLinks.createdBy))
    .where(eq(shareLinks.assetId, assetId))
    .orderBy(desc(shareLinks.createdAt));
  const now = new Date();
  return rows.map(({ passwordHash, revokedAt, ...row }) => ({
    ...row,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    hasPassword: passwordHash !== null,
    state: linkState({ revokedAt, expiresAt: row.expiresAt }, now),
  }));
}

// --- Guests ---

export type ShareAccess = NonNullable<Awaited<ReturnType<typeof getShareAccess>>>;

// The link behind a token, if it's usable right now, with the asset and the
// version it shows. `unlocked` is false while a password is still needed.
// cache(): the page, its metadata and data loads share one lookup per request.
export const getShareAccess = cache(async (token: string) => {
  if (!isWellFormedToken(token)) return null;
  const db = getDb();
  const [row] = await db
    .select({
      link: shareLinks,
      asset: { id: assets.id, name: assets.name, kind: assets.kind, projectId: assets.projectId },
    })
    .from(shareLinks)
    .innerJoin(assets, eq(assets.id, shareLinks.assetId))
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .where(and(eq(shareLinks.tokenHash, hashToken(token)), isNull(projects.archivedAt)))
    .limit(1);
  if (!row || linkState(row.link, new Date()) !== "active") return null;

  // A fixed version, or whatever is newest right now.
  const [version] = await db
    .select({
      id: assetVersions.id,
      number: assetVersions.number,
      durationMs: assetVersions.durationMs,
      fps: assetVersions.fps,
      processingState: assetVersions.processingState,
      originalKey: assetVersions.originalKey,
      originalMime: assetVersions.originalMime,
      posterKey: assetVersions.posterKey,
    })
    .from(assetVersions)
    .where(row.link.versionId ? eq(assetVersions.id, row.link.versionId) : eq(assetVersions.assetId, row.asset.id))
    .orderBy(desc(assetVersions.number))
    .limit(1);
  if (!version) return null;

  let unlocked = row.link.passwordHash === null;
  if (!unlocked) {
    const sessionToken = (await cookies()).get(GUEST_COOKIE)?.value;
    if (sessionToken) {
      const [session] = await db
        .select({ id: shareLinkSessions.tokenHash })
        .from(shareLinkSessions)
        .where(
          and(
            eq(shareLinkSessions.tokenHash, hashToken(sessionToken)),
            eq(shareLinkSessions.shareLinkId, row.link.id),
            gt(shareLinkSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      unlocked = Boolean(session);
    }
  }
  return { link: row.link, asset: row.asset, version, unlocked };
});

// For the guest Route Handlers: the link must be active and, if it has a
// password, unlocked. One 404 for every failure, as for members.
export async function requireShareAccess(token: string) {
  const access = await getShareAccess(token);
  if (!access || !access.unlocked) throw new ApiError(404, "not_found", "This link is not available.");
  return access;
}

// The client's address as seen by the first proxy in front of us (Next's own
// server sets x-forwarded-for when there is none).
async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export type UnlockResult = { ok: true } | { ok: false; code: "not_found" | "rate_limited" | "wrong_password"; message: string };

// Password check with brute-force limits per IP and per link (Redis). While
// a limit is reached, attempts are refused without checking the password.
export async function unlockShareLink(token: string, password: string): Promise<UnlockResult> {
  const access = await getShareAccess(token);
  if (!access) return { ok: false, code: "not_found", message: "This link is not available." };
  if (access.unlocked) return { ok: true };

  const limits = [
    { key: `share-fail:ip:${await clientIp()}`, max: ATTEMPTS_PER_IP },
    { key: `share-fail:link:${access.link.id}`, max: ATTEMPTS_PER_LINK },
  ];
  const tooMany = {
    ok: false as const,
    code: "rate_limited" as const,
    message: `Too many wrong passwords. Try again in ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
  };
  if (await isLimited(limits)) return tooMany;

  if (!(await verifyPassword(password, access.link.passwordHash!))) {
    await countFailure(limits);
    return (await isLimited(limits)) ? tooMany : { ok: false, code: "wrong_password", message: "Wrong password." };
  }

  const sessionToken = generateToken();
  const expiresAt = guestSessionExpiry(access.link.expiresAt, new Date());
  await getDb().insert(shareLinkSessions).values({ tokenHash: hashToken(sessionToken), shareLinkId: access.link.id, expiresAt });
  (await cookies()).set(GUEST_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().APP_URL.startsWith("https://"),
    path: sharePath(token),
    expires: expiresAt,
  });
  return { ok: true };
}
