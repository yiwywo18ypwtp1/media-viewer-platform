"use client";

import { useRef, type PointerEvent } from "react";
import { seekTo, usePlayer } from "../player-context";
import { formatTimecode } from "../timecode";
import { useVideoTime } from "../use-video-time";

// Seek bar. The playhead moves via a CSS transform set from a ref on every
// frame; React never re-renders it during playback.
export function Timeline() {
  const { videoRef, rate, durationSeconds } = usePlayer();
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);

  useVideoTime(videoRef, (seconds) => {
    const fraction = durationSeconds > 0 ? Math.min(seconds / durationSeconds, 1) : 0;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${fraction})`;
    // Keep the slider's accessible value in sync without React state.
    trackRef.current?.setAttribute("aria-valuenow", seconds.toFixed(2));
    trackRef.current?.setAttribute("aria-valuetext", formatTimecode(seconds, rate));
  });

  function seekToPointer(event: PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    const track = trackRef.current;
    if (!video || !track) return;
    const box = track.getBoundingClientRect();
    const fraction = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    seekTo(video, fraction * durationSeconds);
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Number(durationSeconds.toFixed(2))}
      // Initial value only: updated from the ref above. React leaves it alone
      // because this prop never changes between renders.
      aria-valuenow={0}
      className="relative h-2 w-full cursor-pointer rounded-full bg-white/25 outline-none focus-visible:ring-2 focus-visible:ring-white"
      // Pointer capture: dragging keeps seeking even outside the bar.
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seekToPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekToPointer(event);
      }}
    >
      {/* Initial transform via `style`, not a scale-x-0 class: Tailwind v4 uses
          the separate CSS `scale` property, which would multiply with ours. */}
      <div
        ref={fillRef}
        className="absolute inset-0 origin-left rounded-full bg-white"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}
