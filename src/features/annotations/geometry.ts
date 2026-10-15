import type { Point } from "./schema";

export type Rect = { x: number; y: number; width: number; height: number };

// Where the picture actually is inside a <video> with object-fit: contain.
// The element box is usually a different shape than the video, so the
// picture is centred with bars (letterbox top/bottom, pillarbox left/right).
// Annotations are relative to the picture, not to the element box.
export function contentRect(box: { width: number; height: number }, video: { width: number; height: number }): Rect {
  if (!video.width || !video.height || !box.width || !box.height) return { x: 0, y: 0, width: box.width, height: box.height };
  const scale = Math.min(box.width / video.width, box.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

// Pixel position (relative to the same origin as `rect`) -> 0..1 on the picture.
// Clamped: a stroke that leaves the picture sticks to its edge.
export function toNormalized(pixel: { x: number; y: number }, rect: Rect): Point {
  return {
    x: clamp((pixel.x - rect.x) / rect.width),
    y: clamp((pixel.y - rect.y) / rect.height),
  };
}

// 0..1 on the picture -> pixels inside the picture's box (origin at its top-left).
export function toPixels(point: Point, rect: Pick<Rect, "width" | "height">): { x: number; y: number } {
  return { x: point.x * rect.width, y: point.y * rect.height };
}
