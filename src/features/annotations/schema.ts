import { z } from "zod";

// Drawing on a video frame (task section 2: Shape / Point). Points are
// normalized to the frame: 0..1 on both axes, so a drawing lands on the same
// spot of the picture at any player size, including fullscreen.

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const shapeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("arrow"), from: point, to: point, color }),
  z.object({ kind: z.literal("rect"), at: point, size: point, color }),
  z.object({ kind: z.literal("freehand"), points: z.array(point).min(2).max(2000), color }),
]);

export const annotationSchema = z.array(shapeSchema).min(1).max(50);

export type Point = z.infer<typeof point>;
export type Shape = z.infer<typeof shapeSchema>;
export type Tool = Shape["kind"];

export const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff"] as const;
