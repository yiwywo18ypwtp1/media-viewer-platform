import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "./csp";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((d) => d.startsWith(`${name} `))
    ?.split(" ")
    .slice(1);

const production = contentSecurityPolicy({ nonce: "abc123", s3Origin: "http://localhost:9000", dev: false, https: false });

describe("contentSecurityPolicy", () => {
  it("runs only nonce'd scripts, never inline ones or eval", () => {
    const scripts = directive(production, "script-src");
    expect(scripts).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'", "'wasm-unsafe-eval'"]);
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in development", () => {
    const dev = contentSecurityPolicy({ nonce: "n", s3Origin: "http://s3", dev: true, https: false });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("lets media, images and uploads reach S3 and nothing else", () => {
    for (const name of ["img-src", "media-src", "connect-src"]) {
      expect(directive(production, name)).toContain("http://localhost:9000");
    }
    expect(directive(production, "default-src")).toEqual(["'self'"]);
  });

  it("can't be framed and has no plugins", () => {
    expect(directive(production, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(production, "object-src")).toEqual(["'none'"]);
  });

  it("upgrades insecure requests only on HTTPS", () => {
    expect(production).not.toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ nonce: "n", s3Origin: "https://s3", dev: false, https: true })).toContain(
      "upgrade-insecure-requests",
    );
  });
});
