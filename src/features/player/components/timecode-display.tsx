"use client";

import { useRef } from "react";
import { usePlayer } from "../player-context";
import { formatTimecode } from "../timecode";
import { useVideoTime } from "../use-video-time";

// Current timecode. Written to the DOM directly every frame (no state), so
// the rest of the page doesn't re-render during playback.
export function TimecodeDisplay() {
  const { videoRef, rate, durationSeconds } = usePlayer();
  const currentRef = useRef<HTMLSpanElement>(null);

  useVideoTime(videoRef, (seconds) => {
    if (currentRef.current) currentRef.current.textContent = formatTimecode(seconds, rate);
  });

  return (
    <span className="font-mono text-xs tabular-nums">
      <span ref={currentRef}>{formatTimecode(0, rate)}</span>
      <span className="text-neutral-400"> / {formatTimecode(durationSeconds, rate)}</span>
    </span>
  );
}
