"use client";

import { retryProcessing } from "../actions";
import { useI18n } from "@/i18n/client";
import { useLiveProcessing } from "./project-events";

type Props = {
  versionId: string;
  // What the server rendered; live SSE updates take over while processing runs.
  initial: { state: "pending" | "running" | "ready" | "failed"; progress: number; error: string | null };
  canRetry: boolean;
};

export function ProcessingBadge({ versionId, initial, canRetry }: Props) {
  const { state, progress, error } = useLiveProcessing(versionId) ?? initial;
  const { t, tm } = useI18n();

  if (state === "ready") return null;

  if (state === "failed") {
    return (
      <span className="flex flex-col gap-0.5 text-xs">
        <span className="text-red-600">
          {t.processing.failed}
          {error ? `: ${tm(error)}` : ""}
        </span>
        {canRetry && (
          <form action={retryProcessing.bind(null, versionId)}>
            <button type="submit" className="underline">
              {t.assets.retry}
            </button>
          </form>
        )}
      </span>
    );
  }

  if (state === "running") {
    return (
      <span className="flex items-center gap-2 text-xs text-neutral-500">
        <progress className="h-1 w-16" value={progress} max={100} aria-label={t.processing.progress} />
        <span className="tabular-nums">{t.processing.percent(progress)}</span>
      </span>
    );
  }

  // pending: queued, or waiting for an automatic retry after an error.
  return (
    <span className="text-xs text-neutral-500" title={error ? tm(error) : undefined}>
      {error ? t.processing.retryingSoon : t.processing.waiting}
    </span>
  );
}
