"use client";

import { COLORS, type Tool } from "../schema";

const TOOLS: { tool: Tool; label: string }[] = [
  { tool: "arrow", label: "Arrow" },
  { tool: "rect", label: "Rectangle" },
  { tool: "freehand", label: "Pen" },
];

const COLOR_NAMES: Record<(typeof COLORS)[number], string> = {
  "#ef4444": "Red",
  "#f59e0b": "Amber",
  "#22c55e": "Green",
  "#3b82f6": "Blue",
  "#ffffff": "White",
};

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
  return (
    <div role="toolbar" aria-label="Drawing tools" className="flex flex-wrap items-center gap-2 text-xs">
      {TOOLS.map(({ tool, label }) => (
        <button
          key={tool}
          type="button"
          aria-pressed={props.tool === tool}
          onClick={() => props.onTool(tool)}
          className={`rounded px-2 py-1 ${props.tool === tool ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "bg-neutral-100 dark:bg-neutral-800"}`}
        >
          {label}
        </button>
      ))}
      <span className="flex gap-1" role="group" aria-label="Colour">
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={COLOR_NAMES[color]}
            aria-pressed={props.color === color}
            onClick={() => props.onColor(color)}
            style={{ backgroundColor: color }}
            className={`h-5 w-5 rounded-full border border-neutral-400 ${props.color === color ? "ring-2 ring-neutral-900 ring-offset-1 dark:ring-neutral-100" : ""}`}
          />
        ))}
      </span>
      <button type="button" className="underline disabled:opacity-40" disabled={props.shapeCount === 0} onClick={props.onUndo}>
        Undo
      </button>
      <button type="button" className="underline disabled:opacity-40" disabled={props.shapeCount === 0} onClick={props.onClear}>
        Clear
      </button>
      <button type="button" className="underline" onClick={props.onDone}>
        Done
      </button>
    </div>
  );
}
