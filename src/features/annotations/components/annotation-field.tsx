"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { usePlayer } from "@/features/player/player-context";
import { useI18n } from "@/i18n/client";
import { COLORS, type Shape, type Tool } from "../schema";
import { AnnotationLayer } from "./annotation-layer";
import { AnnotationToolbar } from "./annotation-toolbar";

type Props = {
  // The form's `annotation` value (null = no drawing).
  value: Shape[] | null;
  onChange: (value: Shape[] | null) => void;
  // The comment's frame; drawing needs one, so starting to draw pins it.
  atMs: number | null;
  pinCurrentFrame: () => number | null;
};

// A form field for drawing on the frame. The value lives in the comment form
// (React Hook Form); this component only adds the tools and the drawing layer,
// which is portaled over the video.
export function AnnotationField({ value, onChange, atMs, pinCurrentFrame }: Props) {
  const player = usePlayer();
  const { t } = useI18n();
  const { setDrawing } = player;
  const [drawing, setDrawingMode] = useState(false);
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>(COLORS[0]);
  const shapes = value ?? [];

  // While the form holds a drawing, the "selected comment" layer steps aside.
  const active = drawing || shapes.length > 0;
  useEffect(() => {
    setDrawing(active);
    return () => setDrawing(false);
  }, [active, setDrawing]);

  const undo = () => onChange(shapes.length > 1 ? shapes.slice(0, -1) : null);
  const onUndoKey = useEffectEvent(undo);

  // Ctrl/⌘+Z while drawing.
  useEffect(() => {
    if (!drawing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "z" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onUndoKey();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawing]);

  function startDrawing() {
    const video = player.videoRef.current;
    video?.pause();
    if (atMs === null && pinCurrentFrame() === null) return;
    // On narrow screens the form sits below the player: bring the frame into view.
    video?.scrollIntoView({ block: "nearest" });
    setDrawingMode(true);
  }

  return (
    <div className="flex flex-col gap-1">
      {drawing ? (
        <AnnotationToolbar
          tool={tool}
          color={color}
          shapeCount={shapes.length}
          onTool={setTool}
          onColor={setColor}
          onUndo={undo}
          onClear={() => onChange(null)}
          onDone={() => setDrawingMode(false)}
        />
      ) : (
        <div className="flex gap-3 text-xs">
          <button type="button" className="underline" onClick={startDrawing}>
            {shapes.length > 0 ? t.annotations.editDrawing(shapes.length) : t.annotations.draw}
          </button>
          {shapes.length > 0 && (
            <button type="button" className="underline" onClick={() => onChange(null)}>
              {t.annotations.removeDrawing}
            </button>
          )}
        </div>
      )}

      {atMs !== null && (drawing || shapes.length > 0) && (
        <AnnotationLayer
          shapes={shapes}
          atMs={atMs}
          drawing={drawing ? { tool, color, onAdd: (shape) => onChange([...shapes, shape]) } : undefined}
        />
      )}
    </div>
  );
}
