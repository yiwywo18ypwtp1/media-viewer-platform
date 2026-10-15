import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it.each([
    ["/p/123", "/p/123"],
    ["/a/1?t=5#c", "/a/1?t=5#c"],
  ])("keeps same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    undefined,
    ["/a"],
    "",
    "p/123",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "javascript:alert(1)",
  ])("falls back for %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });
});
