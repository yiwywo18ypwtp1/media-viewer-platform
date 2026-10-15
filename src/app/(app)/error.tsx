"use client";

// Catches unexpected errors in app pages and Server Actions, so one failing
// section shows a recoverable message instead of a blank page.
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-neutral-500">The action couldn&apos;t be completed. Try again.</p>
      <button type="button" onClick={reset} className="text-sm underline">
        Try again
      </button>
    </div>
  );
}
