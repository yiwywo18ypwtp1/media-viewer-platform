// Share link rules as pure functions (tested in link-state.test.ts).

export type LinkState = "active" | "revoked" | "expired";

export function linkState(link: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): LinkState {
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

// Tokens are 32 random bytes in base64url (see server/tokens.ts). Anything
// else is refused before touching the database.
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

// A guest's unlocked session lasts 12 hours, never past the link itself.
const GUEST_SESSION_MS = 12 * 60 * 60 * 1000;

export function guestSessionExpiry(linkExpiresAt: Date | null, now: Date): Date {
  const capped = new Date(now.getTime() + GUEST_SESSION_MS);
  return linkExpiresAt && linkExpiresAt < capped ? linkExpiresAt : capped;
}

// Password attempts allowed per 15 minutes: from one IP (one guest guessing),
// and on one link from everywhere (many IPs guessing together).
export const ATTEMPTS_PER_IP = 10;
export const ATTEMPTS_PER_LINK = 50;

// Guests get media URLs that live 5 minutes at most: after a revoke, nothing
// they hold keeps working longer than that. Their player refreshes them.
export const GUEST_URL_TTL_SECONDS = 5 * 60;
