import { createHash, randomBytes } from "node:crypto";

// Opaque random tokens (sessions, password resets, invitations).
// The raw token goes to the user; only its hash is stored.

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

// SHA-256 without salt is fine here: the token has 256 bits of randomness,
// so there is nothing to brute-force (unlike a password).
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
