"use client";

import { createContext, use, useRef, type ReactNode, type RefObject } from "react";
import { frameAt, frameMiddle, frameRate, type FrameRate } from "./timecode";

// What the player shares with its controls, the comment form and (later) the
// annotation layer: the <video> element and its frame rate. Deliberately NOT
// the current time: that changes every frame, and putting it in context would
// re-render every consumer 60 times a second. Consumers read
// videoRef.current.currentTime when they need it.

export type PlayerContextValue = {
  videoRef: RefObject<HTMLVideoElement | null>;
  rate: FrameRate;
  durationSeconds: number;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

// Owns the <video> ref; the Player renders the element, siblings (comments)
// read it through usePlayer().
export function PlayerProvider(props: { fps: number | null; durationMs: number; children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // ffprobe gives fps for nearly every file; 25 is a safe fallback for the rest.
  const rate = frameRate(props.fps ?? 25);
  return (
    <PlayerContext value={{ videoRef, rate, durationSeconds: props.durationMs / 1000 }}>{props.children}</PlayerContext>
  );
}

export function usePlayer(): PlayerContextValue {
  const value = use(PlayerContext);
  if (!value) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return value;
}

// For components that also work without a video (comments on an image).
export function useOptionalPlayer(): PlayerContextValue | null {
  return use(PlayerContext);
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

// The current frame as a comment timecode: the frame's middle, in whole ms
// (so it maps back to the same frame, see timecode.test.ts).
export function currentFrameMs(video: HTMLVideoElement, rate: FrameRate): number {
  return Math.round(frameMiddle(frameAt(video.currentTime, rate.fps), rate.fps) * 1000);
}
