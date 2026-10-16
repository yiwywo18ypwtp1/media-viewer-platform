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
    // At the very end currentTime can run a few ms past the probed duration
    // (audio a touch longer than video): show the same timecode as the total.
    if (currentRef.current) currentRef.current.textContent = formatTimecode(Math.min(seconds, durationSeconds), rate);
  });

  return (
    <span className="font-mono text-xs tabular-nums">
      <span ref={currentRef}>{formatTimecode(0, rate)}</span>
      <span className="text-neutral-400"> / {formatTimecode(durationSeconds, rate)}</span>
    </span>
  );
}
