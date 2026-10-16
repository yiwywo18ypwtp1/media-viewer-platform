import { describe, expect, it } from "vitest";
import { folderNameSchema, folderPathOf } from "./schema";

describe("folderPathOf", () => {
  it("returns the folders above a dropped file", () => {
    expect(folderPathOf("/Shots/Day 1/clip.mp4")).toEqual(["Shots", "Day 1"]);
    expect(folderPathOf("Shots/clip.mp4")).toEqual(["Shots"]);
  });

  it("is empty for a file dropped on its own", () => {
    expect(folderPathOf("/clip.mp4")).toEqual([]);
    expect(folderPathOf("clip.mp4")).toEqual([]);
  });
});

describe("folderNameSchema", () => {
  it("rejects names that would read as paths", () => {
    expect(folderNameSchema.safeParse("a/b").success).toBe(false);
    expect(folderNameSchema.safeParse("..").success).toBe(false);
    expect(folderNameSchema.safeParse("  ").success).toBe(false);
    expect(folderNameSchema.safeParse(" Day 1 ").data).toBe("Day 1");
  });
});
