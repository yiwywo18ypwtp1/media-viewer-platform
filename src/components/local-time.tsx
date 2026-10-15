"use client";

// A timestamp in the viewer's own time zone. The server renders it in its
// zone and the browser re-renders it in the viewer's, hence the suppressed
// hydration warning on this one element.
export function LocalTime({ value, withTime = true }: { value: Date | string; withTime?: boolean }) {
  const date = new Date(value);
  const format = new Intl.DateTimeFormat(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
  return (
    <time dateTime={date.toISOString()} suppressHydrationWarning>
      {format.format(date)}
    </time>
  );
}
