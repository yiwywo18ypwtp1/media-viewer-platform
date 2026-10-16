import { describe, expect, it } from "vitest";
import { planSprite, spriteCellAt, spriteRows } from "./sprite";

describe("planSprite", () => {
  it("takes one thumbnail per second for short videos", () => {
    const sprite = planSprite(12_500, 1920, 1080);
    expect(sprite).toEqual({ intervalMs: 1000, count: 13, columns: 10, thumbWidth: 160, thumbHeight: 90 });
    expect(spriteRows(sprite)).toBe(2);
  });

  it("caps long videos at 100 thumbnails", () => {
    const sprite = planSprite(2 * 60 * 60 * 1000, 1280, 720);
    expect(sprite.count).toBe(100);
    expect(sprite.intervalMs).toBe(72_000);
    expect(spriteRows(sprite)).toBe(10);
  });

  it("keeps the aspect ratio with an even height", () => {
    expect(planSprite(5000, 1080, 1920).thumbHeight).toBe(284); // portrait 9:16
    expect(planSprite(5000, 640, 480).thumbHeight).toBe(120);
  });

  it("uses fewer columns than 10 when there are fewer thumbnails", () => {
    expect(planSprite(3000, 1280, 720).columns).toBe(3);
  });
});

describe("spriteCellAt", () => {
  const sprite = planSprite(25_000, 1280, 720); // 25 thumbs, 10 per row, 160×90

  it("maps a time to its row and column", () => {
    expect(spriteCellAt(sprite, 0)).toEqual({ x: 0, y: 0 });
    expect(spriteCellAt(sprite, 9.99)).toEqual({ x: 1440, y: 0 });
    expect(spriteCellAt(sprite, 12.3)).toEqual({ x: 320, y: 90 });
  });

  it("clamps past the ends", () => {
    expect(spriteCellAt(sprite, -1)).toEqual({ x: 0, y: 0 });
    expect(spriteCellAt(sprite, 999)).toEqual({ x: 640, y: 180 });
  });
});
