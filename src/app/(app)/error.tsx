"use client";

import { useI18n } from "@/i18n/client";

// Catches unexpected errors in app pages and Server Actions, so one failing
// section shows a recoverable message instead of a blank page.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">{t.errorPage.title}</h1>
      <p className="text-sm text-neutral-500">{t.errorPage.text}</p>
      <button type="button" onClick={reset} className="text-sm underline">
        {t.common.tryAgain}
      </button>
    </div>
  );
}
