import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "@/server/tokens";
import { guestSessionExpiry, isWellFormedToken, linkState } from "./link-state";

const now = new Date("2026-10-16T12:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3600_000);

describe("linkState", () => {
  it("is active without an expiry", () => {
    expect(linkState({ revokedAt: null, expiresAt: null }, now)).toBe("active");
  });

  it("is active until the expiry, expired from it on", () => {
    expect(linkState({ revokedAt: null, expiresAt: hours(1) }, now)).toBe("active");
    expect(linkState({ revokedAt: null, expiresAt: now }, now)).toBe("expired");
    expect(linkState({ revokedAt: null, expiresAt: hours(-1) }, now)).toBe("expired");
  });

  it("treats revoked as final, even before the expiry", () => {
    expect(linkState({ revokedAt: hours(-1), expiresAt: hours(5) }, now)).toBe("revoked");
  });
});

describe("tokens", () => {
  it("accepts generated tokens and nothing else", () => {
    expect(isWellFormedToken(generateToken())).toBe(true);
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(`${generateToken().slice(0, 42)}/`)).toBe(false);
  });

  it("stores a hash that only the same token matches", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("guestSessionExpiry", () => {
  it("lasts 12 hours", () => {
    expect(guestSessionExpiry(null, now)).toEqual(hours(12));
  });

  it("never outlives the link", () => {
    expect(guestSessionExpiry(hours(2), now)).toEqual(hours(2));
  });
});
