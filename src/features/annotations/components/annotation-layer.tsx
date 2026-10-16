"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/features/player/player-context";
import { frameAt } from "@/features/player/timecode";
import { useI18n } from "@/i18n/client";
import { contentRect, toNormalized, toPixels, type Rect } from "../geometry";
import type { Point, Shape, Tool } from "../schema";

type Props = {
  shapes: Shape[];
  // The frame the drawing belongs to: shown only while paused on it.
  atMs: number;
  // Present when the user is drawing (the comment form); absent when showing.
  drawing?: { tool: Tool; color: string; onAdd: (shape: Shape) => void };
};

// SVG laid over the picture, portaled into the player's overlay element so
// it follows the player into fullscreen. Shapes are stored normalized (0..1 of
// the picture) and converted to pixels for the current size on every render.
// The shape being drawn is local state here: drawing re-renders this layer
// only, never the comment list.
export function AnnotationLayer({ shapes, atMs, drawing }: Props) {
  const { videoRef, overlayHost, rate } = usePlayer();
  const { t } = useI18n();
  const visible = useOnFrame(videoRef, frameAt(atMs / 1000, rate.fps), rate.fps);
  const rect = usePictureRect(videoRef, overlayHost);
  const [draft, setDraft] = useState<Shape | null>(null);
  const start = useRef<Point | null>(null);

  if (!overlayHost || !rect || !visible) return null;

  function pointFrom(event: PointerEvent<SVGSVGElement>): Point {
    const box = event.currentTarget.getBoundingClientRect();
    return toNormalized({ x: event.clientX - box.left, y: event.clientY - box.top }, { x: 0, y: 0, width: box.width, height: box.height });
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    start.current = point;
    setDraft(
      drawing.tool === "arrow"
        ? { kind: "arrow", from: point, to: point, color: drawing.color }
        : drawing.tool === "rect"
          ? { kind: "rect", at: point, size: { x: 0, y: 0 }, color: drawing.color }
          : { kind: "freehand", points: [point], color: drawing.color },
    );
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const from = start.current;
    if (!draft || !from) return;
    const point = pointFrom(event);
    if (draft.kind === "arrow") setDraft({ ...draft, to: point });
    else if (draft.kind === "rect") {
      setDraft({
        ...draft,
        at: { x: Math.min(from.x, point.x), y: Math.min(from.y, point.y) },
        size: { x: Math.abs(point.x - from.x), y: Math.abs(point.y - from.y) },
      });
    } else {
      // Skip tiny moves: keeps the stroke smooth and the payload small.
      const last = draft.points[draft.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) > 0.003) setDraft({ ...draft, points: [...draft.points, point] });
    }
  }

  function onPointerUp() {
    if (draft && drawing && isMeaningful(draft)) drawing.onAdd(draft);
    setDraft(null);
    start.current = null;
  }

  return createPortal(
    <svg
      role="img"
      aria-label={drawing ? t.annotations.drawingArea : t.annotations.drawingWith(shapes.length)}
      className={`absolute ${drawing ? "pointer-events-auto cursor-crosshair touch-none" : ""}`}
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {[...shapes, ...(draft ? [draft] : [])].map((shape, index) => (
        <ShapeView key={index} shape={shape} size={rect} />
      ))}
    </svg>,
    overlayHost,
  );
}

// Drawings are append-only lists, so the index is a stable key here.
function ShapeView({ shape, size }: { shape: Shape; size: Pick<Rect, "width" | "height"> }) {
  const stroke = {
    stroke: shape.color,
    strokeWidth: 3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
    // Keeps light colours visible on light frames.
    style: { filter: "drop-shadow(0 0 1px rgba(0,0,0,0.9))" },
  };

  if (shape.kind === "rect") {
    const at = toPixels(shape.at, size);
    const end = toPixels(shape.size, size);
    return <rect x={at.x} y={at.y} width={end.x} height={end.y} {...stroke} />;
  }
  if (shape.kind === "freehand") {
    const points = shape.points.map((p) => toPixels(p, size)).map((p) => `${p.x},${p.y}`).join(" ");
    return <polyline points={points} {...stroke} />;
  }
  // Arrow: the head is drawn in pixels, so it keeps its shape at any size.
  const from = toPixels(shape.from, size);
  const to = toPixels(shape.to, size);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = (side: number) => {
    const a = angle + Math.PI - side * (Math.PI / 7);
    return `${to.x + 14 * Math.cos(a)},${to.y + 14 * Math.sin(a)}`;
  };
  return <path d={`M${from.x},${from.y} L${to.x},${to.y} M${head(1)} L${to.x},${to.y} L${head(-1)}`} {...stroke} />;
}

function isMeaningful(shape: Shape): boolean {
  if (shape.kind === "arrow") return Math.hypot(shape.to.x - shape.from.x, shape.to.y - shape.from.y) > 0.01;
  if (shape.kind === "rect") return shape.size.x > 0.005 && shape.size.y > 0.005;
  return shape.points.length >= 2;
}

// --- Hooks ---

// True while the video is paused on `frame`. Read from the element (an
// external store), so playback itself never re-renders anything here.
function useOnFrame(videoRef: RefObject<HTMLVideoElement | null>, frame: number, fps: number) {
  return useSyncExternalStore(
    (onChange) => {
      const video = videoRef.current;
      if (!video) return () => {};
      const events = ["play", "pause", "seeked", "loadedmetadata"] as const;
      events.forEach((name) => video.addEventListener(name, onChange));
      return () => events.forEach((name) => video.removeEventListener(name, onChange));
    },
    () => {
      const video = videoRef.current;
      return Boolean(video && video.paused && frameAt(video.currentTime, fps) === frame);
    },
    () => false,
  );
}

// The picture's box relative to the overlay, recomputed when anything that
// can move it changes: element size (window, fullscreen) or video metadata.
function usePictureRect(videoRef: RefObject<HTMLVideoElement | null>, host: HTMLElement | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !host) return;
    const measure = () => {
      const videoBox = video.getBoundingClientRect();
      const hostBox = host.getBoundingClientRect();
      const picture = contentRect(videoBox, { width: video.videoWidth, height: video.videoHeight });
      setRect({
        x: videoBox.left - hostBox.left + picture.x,
        y: videoBox.top - hostBox.top + picture.y,
        width: picture.width,
        height: picture.height,
      });
    };
    // ResizeObserver also fires once right after observe(): the first measurement.
    const observer = new ResizeObserver(measure);
    observer.observe(video);
    observer.observe(host);
    video.addEventListener("loadedmetadata", measure);
    document.addEventListener("fullscreenchange", measure);
    return () => {
      observer.disconnect();
      video.removeEventListener("loadedmetadata", measure);
      document.removeEventListener("fullscreenchange", measure);
    };
  }, [videoRef, host]);

  return rect;
}
