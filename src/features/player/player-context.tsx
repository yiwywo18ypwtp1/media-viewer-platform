"use client";

import { createContext, use, type RefObject } from "react";
import { frameAt, frameMiddle, type FrameRate } from "./timecode";

// What the player shares with its controls (and, later, the comment form and
// annotation layer): the <video> element and its frame rate. Deliberately NOT
// the current time: that changes every frame, and putting it in context would
// re-render every consumer 60 times a second. Consumers read
// videoRef.current.currentTime when they need it.

export type PlayerContextValue = {
  videoRef: RefObject<HTMLVideoElement | null>;
  rate: FrameRate;
  durationSeconds: number;
};

export const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const value = use(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside <Player>");
  return value;
}

// --- Commands on the video element ---

export function togglePlay(video: HTMLVideoElement) {
  if (video.paused) void video.play();
  else video.pause();
}

export function seekTo(video: HTMLVideoElement, seconds: number) {
  video.currentTime = Math.min(Math.max(0, seconds), video.duration || 0);
}

// Pause and move by whole frames, landing in the middle of the target frame.
export function stepFrames(video: HTMLVideoElement, rate: FrameRate, delta: number) {
  video.pause();
  const lastFrame = Math.max(0, frameAt(video.duration, rate.fps) - 1);
  const target = Math.min(Math.max(frameAt(video.currentTime, rate.fps) + delta, 0), lastFrame);
  video.currentTime = frameMiddle(target, rate.fps);
}
