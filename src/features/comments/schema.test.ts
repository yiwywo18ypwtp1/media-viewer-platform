import { describe, expect, it } from "vitest";
import { createCommentSchema } from "./schema";

const base = {
  id: "00000000-0000-4000-8000-000000000001",
  body: "Look here",
  annotation: null,
  parentId: null,
  mentions: [],
};

describe("comment ranges", () => {
  it("accepts a range that ends after it starts", () => {
    const parsed = createCommentSchema.parse({ ...base, timecodeMs: 1000, rangeEndMs: 2500 });
    expect(parsed.rangeEndMs).toBe(2500);
  });

  it("defaults to a single point", () => {
    expect(createCommentSchema.parse({ ...base, timecodeMs: 1000 }).rangeEndMs).toBeNull();
  });

  it("rejects an end before (or at) the start", () => {
    const result = createCommentSchema.safeParse({ ...base, timecodeMs: 2500, rangeEndMs: 2500 });
    expect(result.error?.issues[0]).toMatchObject({ path: ["rangeEndMs"] });
  });

  it("rejects an end without a start", () => {
    expect(createCommentSchema.safeParse({ ...base, timecodeMs: null, rangeEndMs: 2500 }).success).toBe(false);
  });
});
