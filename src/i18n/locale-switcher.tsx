"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "./actions";
import { useI18n } from "./client";
import { LOCALES } from "./locales";

const LABELS = { en: "EN", ru: "RU" } as const;

// EN | RU in the header. The server renders every page in the chosen
// language, so switching saves the choice and re-renders.
export function LocaleSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="group" aria-label={t.common.language} className="flex gap-1 text-xs">
      {LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          disabled={pending}
          aria-pressed={locale === value}
          onClick={() =>
            startTransition(async () => {
              await setLocale(value);
              router.refresh();
            })
          }
          className={locale === value ? "font-semibold underline" : "text-neutral-500 hover:underline"}
        >
          {LABELS[value]}
        </button>
      ))}
    </div>
  );
}
