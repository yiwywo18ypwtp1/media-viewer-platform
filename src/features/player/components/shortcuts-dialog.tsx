"use client";

import type { RefObject } from "react";

export const SHORTCUTS: [keys: string, action: string][] = [
  ["Space / K", "Play / pause"],
  ["L", "Play; press again for 2×"],
  ["J", "Back 1 second"],
  [", / .", "Previous / next frame"],
  ["← / →", "Back / forward 5 seconds"],
  ["F", "Fullscreen"],
  ["M", "Mute"],
  ["?", "Show this list"],
];

// Native <dialog>: focus trapping, Esc to close and the backdrop come free.
export function ShortcutsDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="shortcuts-title"
      className="m-auto rounded-md p-6 text-sm backdrop:bg-black/50 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <h2 id="shortcuts-title" className="mb-3 text-base font-semibold">
        Keyboard shortcuts
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="contents">
            <dt className="font-mono">{keys}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <form method="dialog" className="mt-4 text-right">
        <button className="underline">Close</button>
      </form>
    </dialog>
  );
}
