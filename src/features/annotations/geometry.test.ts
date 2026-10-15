import { describe, expect, it } from "vitest";
import { contentRect, toNormalized, toPixels } from "./geometry";
import { annotationSchema } from "./schema";

describe("contentRect", () => {
  it("fills a box of the same aspect ratio", () => {
    expect(contentRect({ width: 1280, height: 720 }, { width: 1920, height: 1080 })).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });

  it("letterboxes a wide video in a tall box (bars top and bottom)", () => {
    expect(contentRect({ width: 800, height: 800 }, { width: 1920, height: 1080 })).toEqual({
      x: 0,
      y: 175,
      width: 800,
      height: 450,
    });
  });

  it("pillarboxes a tall video in a wide box (bars left and right)", () => {
    expect(contentRect({ width: 1600, height: 900 }, { width: 1080, height: 1920 })).toEqual({
      x: 546.875,
      y: 0,
      width: 506.25,
      height: 900,
    });
  });

  it("falls back to the whole box before metadata is known", () => {
    expect(contentRect({ width: 640, height: 360 }, { width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 640, height: 360 });
  });
});

describe("normalization", () => {
  it("maps a pixel to the same frame point in a small window and in fullscreen", () => {
    const video = { width: 1920, height: 1080 };
    const small = contentRect({ width: 640, height: 480 }, video); // letterboxed
    const fullscreen = contentRect({ width: 2560, height: 1600 }, video); // letterboxed differently

    // A point drawn at 25% / 75% of the picture in the small player...
    const drawn = { x: small.x + small.width * 0.25, y: small.y + small.height * 0.75 };
    const stored = toNormalized(drawn, small);
    expect(stored.x).toBeCloseTo(0.25);
    expect(stored.y).toBeCloseTo(0.75);

    // ...lands on the same spot of the picture in fullscreen.
    const shown = toPixels(stored, fullscreen);
    expect(shown.x / fullscreen.width).toBeCloseTo(0.25);
    expect(shown.y / fullscreen.height).toBeCloseTo(0.75);
  });

  it("clamps points dragged outside the picture (onto the bars)", () => {
    const rect = { x: 0, y: 100, width: 800, height: 450 };
    expect(toNormalized({ x: -20, y: 20 }, rect)).toEqual({ x: 0, y: 0 });
    expect(toNormalized({ x: 900, y: 700 }, rect)).toEqual({ x: 1, y: 1 });
  });
});

describe("annotationSchema", () => {
  it("accepts the three shape kinds", () => {
    expect(
      annotationSchema.safeParse([
        { kind: "arrow", from: { x: 0.1, y: 0.1 }, to: { x: 0.5, y: 0.5 }, color: "#ef4444" },
        { kind: "rect", at: { x: 0.2, y: 0.2 }, size: { x: 0.3, y: 0.1 }, color: "#3b82f6" },
        { kind: "freehand", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "#ffffff" },
      ]).success,
    ).toBe(true);
  });

  it("rejects coordinates outside the frame and bad colours", () => {
    expect(annotationSchema.safeParse([{ kind: "arrow", from: { x: -0.1, y: 0 }, to: { x: 1, y: 1 }, color: "#ef4444" }]).success).toBe(false);
    expect(annotationSchema.safeParse([{ kind: "rect", at: { x: 0, y: 0 }, size: { x: 1, y: 1 }, color: "red" }]).success).toBe(false);
  });
});
