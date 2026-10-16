"use client";

import { useEffect, useState } from "react";
import type { PlaybackUrls } from "@/features/player/playback";
import { seekTo, usePlayer } from "@/features/player/player-context";
import { formatTimecode } from "@/features/player/timecode";
import type { TranscriptLine } from "../queries";

const SEARCH_DELAY_MS = 250;

// What was said in the video (bonus: Whisper), searchable. Clicking a line
// jumps the player there. Lines come from the API, filtered in Postgres.
export function TranscriptPanel({ versionId, state }: { versionId: string; state: PlaybackUrls["transcript"] }) {
  const { videoRef, rate } = usePlayer();
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<TranscriptLine[] | null>(null);
  const [error, setError] = useState(false);

  // Fetch on open and after typing pauses; a newer search cancels the older one.
  useEffect(() => {
    if (state !== "ready") return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/versions/${versionId}/transcript?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(String(response.status));
        setLines(((await response.json()) as { lines: TranscriptLine[] }).lines);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }, query ? SEARCH_DELAY_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [versionId, query, state]);

  if (state === null) return null;

  return (
    <section aria-label="Transcript" className="flex flex-col gap-2 text-sm">
      <h2 className="font-semibold">Transcript</h2>
      {(state === "pending" || state === "running") && <p className="text-neutral-500">Transcribing the audio…</p>}
      {state === "failed" && <p className="text-neutral-500">The audio couldn’t be transcribed.</p>}
      {state === "ready" && (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search what was said…"
            aria-label="Search the transcript"
            className="rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 dark:border-neutral-700"
          />
          {error && <p role="alert" className="text-red-600">Couldn’t load the transcript.</p>}
          {lines && lines.length === 0 && <p className="text-neutral-500">{query ? "Nothing found." : "No speech found."}</p>}
          {lines && lines.length > 0 && (
            <ol className="flex max-h-64 flex-col gap-0.5 overflow-y-auto" aria-live="polite">
              {lines.map((line) => (
                <li key={line.startMs}>
                  <button
                    type="button"
                    className="flex w-full gap-3 rounded px-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900"
                    onClick={() => {
                      const video = videoRef.current;
                      if (video) seekTo(video, line.startMs / 1000);
                    }}
                  >
                    <span className="shrink-0 font-mono text-xs text-blue-700 dark:text-blue-400">
                      {formatTimecode(line.startMs / 1000, rate)}
                    </span>
                    <span>{line.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
