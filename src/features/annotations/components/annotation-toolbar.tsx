"use client";

import { useI18n } from "@/i18n/client";
import { COLORS, type Tool } from "../schema";

const TOOLS: Tool[] = ["arrow", "rect", "freehand"];

type Props = {
  tool: Tool;
  color: string;
  shapeCount: number;
  onTool: (tool: Tool) => void;
  onColor: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onDone: () => void;
};

// Presentational: the comment form owns the state.
export function AnnotationToolbar(props: Props) {
  const { t } = useI18n();
  return (
    <div role="toolbar" aria-label={t.annotations.tools} className="flex flex-wrap items-center gap-2 text-xs">
      {TOOLS.map((tool) => (
        <button
          key={tool}
          type="button"
          aria-pressed={props.tool === tool}
          onClick={() => props.onTool(tool)}
          className={`rounded px-2 py-1 ${props.tool === tool ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "bg-neutral-100 dark:bg-neutral-800"}`}
        >
          {t.annotations.toolNames[tool]}
        </button>
      ))}
      <span className="flex gap-1" role="group" aria-label={t.annotations.colour}>
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={t.annotations.colours[color]}
            aria-pressed={props.color === color}
            onClick={() => props.onColor(color)}
            style={{ backgroundColor: color }}
            className={`h-5 w-5 rounded-full border border-neutral-400 ${props.color === color ? "ring-2 ring-neutral-900 ring-offset-1 dark:ring-neutral-100" : ""}`}
          />
        ))}
      </span>
      <button type="button" className="underline disabled:opacity-40" disabled={props.shapeCount === 0} onClick={props.onUndo}>
        {t.annotations.undo}
      </button>
      <button type="button" className="underline disabled:opacity-40" disabled={props.shapeCount === 0} onClick={props.onClear}>
        {t.annotations.clear}
      </button>
      <button type="button" className="underline" onClick={props.onDone}>
        {t.annotations.done}
      </button>
    </div>
  );
}
