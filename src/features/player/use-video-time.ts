"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

// Calls `update(currentTime)` on every animation frame while the video plays,
// and once after each seek or pause. Components use it to write straight into
// the DOM through refs (timecode text, playhead position) instead of setting
// React state, so playback causes no React re-renders at all.
export function useVideoTime(videoRef: RefObject<HTMLVideoElement | null>, update: (seconds: number) => void) {
  // useEffectEvent: always calls the latest `update` without re-subscribing.
  const onTime = useEffectEvent(update);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let frame = 0;
    const tick = () => {
      onTime(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      onTime(video.currentTime);
    };
    const once = () => onTime(video.currentTime);

    video.addEventListener("play", start);
    video.addEventListener("pause", stop);
    video.addEventListener("seeked", once);
    video.addEventListener("loadedmetadata", once);
    once();
    if (!video.paused) start();

    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener("play", start);
      video.removeEventListener("pause", stop);
      video.removeEventListener("seeked", once);
      video.removeEventListener("loadedmetadata", once);
    };
  }, [videoRef]);
}
