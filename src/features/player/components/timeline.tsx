"use client";

import { useRef, type PointerEvent } from "react";
import type { PlaybackUrls } from "../playback";
import { seekTo, usePlayer } from "../player-context";
import { spriteCellAt } from "../sprite";
import { formatTimecode } from "../timecode";
import { useVideoTime } from "../use-video-time";

export type TimelineMarker = { id: string; timeMs: number; resolved: boolean; label: string };

// Seek bar with comment markers. The playhead moves via a CSS transform set
// from a ref on every frame; React re-renders the bar only when the markers
// change (a comment added or resolved), never during playback.
export function Timeline({
  markers,
  onMarkerSelect,
  sprite = null,
}: {
  markers: TimelineMarker[];
  onMarkerSelect: (id: string) => void;
  sprite?: PlaybackUrls["sprite"];
}) {
  const { videoRef, rate, durationSeconds } = usePlayer();
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useVideoTime(videoRef, (seconds) => {
    const fraction = durationSeconds > 0 ? Math.min(seconds / durationSeconds, 1) : 0;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${fraction})`;
    // Keep the slider's accessible value in sync without React state.
    trackRef.current?.setAttribute("aria-valuenow", seconds.toFixed(2));
    trackRef.current?.setAttribute("aria-valuetext", formatTimecode(seconds, rate));
  });

  function pointerFraction(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
  }

  function seekToPointer(event: PointerEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (video) seekTo(video, pointerFraction(event) * durationSeconds);
  }

  // Hover preview: the sprite cell and timecode under the pointer, set on the
  // element directly (like the playhead) so moving the mouse re-renders nothing.
  function showPreview(event: PointerEvent<HTMLDivElement>) {
    const preview = previewRef.current;
    if (!preview || !sprite) return;
    const fraction = pointerFraction(event);
    const seconds = fraction * durationSeconds;
    const cell = spriteCellAt(sprite, seconds);
    const image = preview.firstElementChild as HTMLElement;
    image.style.backgroundPosition = `-${cell.x}px -${cell.y}px`;
    preview.lastElementChild!.textContent = formatTimecode(seconds, rate);
    // Centred on the pointer, kept inside the bar.
    const box = event.currentTarget.getBoundingClientRect();
    const left = Math.min(Math.max(fraction * box.width - sprite.thumbWidth / 2, 0), box.width - sprite.thumbWidth);
    preview.style.transform = `translateX(${left}px)`;
    preview.hidden = false;
  }

  return (
    <div className="flex flex-col gap-1">
      {markers.length > 0 && (
        <div className="relative h-3" role="group" aria-label="Comment markers">
          {markers.map((marker) => (
            <button
              key={marker.id}
              type="button"
              onClick={() => onMarkerSelect(marker.id)}
              aria-label={`Comment at ${formatTimecode(marker.timeMs / 1000, rate)}, ${marker.label}`}
              title={marker.label}
              style={{
                left: `${durationSeconds > 0 ? Math.min((marker.timeMs / 1000 / durationSeconds) * 100, 100) : 0}%`,
              }}
              className={`absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-sm focus-visible:outline-2 focus-visible:outline-white ${
                marker.resolved ? "bg-neutral-500" : "bg-amber-400"
              }`}
            />
          ))}
        </div>
      )}
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
          if (event.pointerType === "mouse") showPreview(event);
        }}
        onPointerLeave={() => {
          if (previewRef.current) previewRef.current.hidden = true;
        }}
      >
        {sprite && (
          <div
            ref={previewRef}
            hidden
            aria-hidden
            className="pointer-events-none absolute bottom-4 left-0 z-10 flex flex-col items-center gap-0.5 rounded bg-black/80 p-0.5"
          >
            <div
              style={{
                width: sprite.thumbWidth,
                height: sprite.thumbHeight,
                backgroundImage: `url("${sprite.url}")`,
              }}
            />
            <span className="font-mono text-[10px] text-white" />
          </div>
        )}
        {/* Initial transform via `style`, not a scale-x-0 class: Tailwind v4 uses
          the separate CSS `scale` property, which would multiply with ours. */}
        <div
          ref={fillRef}
          className="absolute inset-0 origin-left rounded-full bg-white"
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}
