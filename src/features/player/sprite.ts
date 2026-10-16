// Scrubbing thumbnails: one JPEG with up to MAX_THUMBS frames in a grid. The
// worker plans and renders it, the timeline shows the cell under the pointer.
// Pure so both sides compute the same geometry (and tests can check it).

export type SpriteInfo = {
  intervalMs: number; // a thumbnail every intervalMs, starting at 0
  count: number;
  columns: number;
  thumbWidth: number;
  thumbHeight: number;
};

const MAX_THUMBS = 100;
const MIN_INTERVAL_MS = 1000;
const COLUMNS = 10;
const THUMB_WIDTH = 160;

export function planSprite(durationMs: number, width: number, height: number): SpriteInfo {
  const intervalMs = Math.max(MIN_INTERVAL_MS, Math.ceil(durationMs / MAX_THUMBS));
  const count = Math.max(1, Math.ceil(durationMs / intervalMs));
  // Even height, as the encoder wants; aspect kept to within a pixel.
  const thumbHeight = Math.max(2, Math.round((THUMB_WIDTH * height) / width / 2) * 2);
  return { intervalMs, count, columns: Math.min(COLUMNS, count), thumbWidth: THUMB_WIDTH, thumbHeight };
}

export function spriteRows(sprite: Pick<SpriteInfo, "count" | "columns">): number {
  return Math.ceil(sprite.count / sprite.columns);
}

// Top-left corner (in sprite pixels) of the thumbnail for a time.
export function spriteCellAt(sprite: SpriteInfo, seconds: number): { x: number; y: number } {
  const index = Math.min(sprite.count - 1, Math.max(0, Math.floor((seconds * 1000) / sprite.intervalMs)));
  return {
    x: (index % sprite.columns) * sprite.thumbWidth,
    y: Math.floor(index / sprite.columns) * sprite.thumbHeight,
  };
}
