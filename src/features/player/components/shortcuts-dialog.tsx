"use client";

import type { RefObject } from "react";
import { useI18n } from "@/i18n/client";

// Native <dialog>: focus trapping, Esc to close and the backdrop come free.
export function ShortcutsDialog({ dialogRef }: { dialogRef: RefObject<HTMLDialogElement | null> }) {
  const { t } = useI18n();
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="shortcuts-title"
      className="m-auto rounded-md p-6 text-sm backdrop:bg-black/50 dark:bg-neutral-900 dark:text-neutral-100"
    >
      <h2 id="shortcuts-title" className="mb-3 text-base font-semibold">
        {t.player.shortcuts}
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        {t.player.shortcutList.map(([keys, action]) => (
          <div key={keys} className="contents">
            <dt className="font-mono">{keys}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <form method="dialog" className="mt-4 text-right">
        <button className="underline">{t.player.close}</button>
      </form>
    </dialog>
  );
}
