"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackUrls } from "../playback";
import { PlayerContext, seekTo, stepFrames, togglePlay } from "../player-context";
import { frameRate } from "../timecode";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { Timeline } from "./timeline";
import { TimecodeDisplay } from "./timecode-display";

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

type Props = {
  assetId: string;
  versionId: string;
  initialUrls: PlaybackUrls;
  fps: number | null;
  durationMs: number;
};

// Native <video> with our own controls. React state holds only what changes on
// user action (playing, speed, mute, fullscreen); the playback position is read
// from the element and drawn through refs (see use-video-time.ts).
export function Player({ assetId, versionId, initialUrls, fps, durationMs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [urls, setUrls] = useState(initialUrls);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ffprobe gives fps for nearly every file; 25 is a safe fallback for the rest.
  const rate = frameRate(fps ?? 25);
  const durationSeconds = durationMs / 1000;
  const resumeAt = useRef<{ time: number; play: boolean } | null>(null);
  // Whether the user wants playback. Kept separately because on a media error
  // the browser marks the element paused *before* the "pause" event fires.
  const wantsToPlay = useRef(false);
  const lastRefresh = useRef(0);

  // Mirror element state into React state (it can change from shortcuts,
  // native gestures or the browser itself).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = (event: Event) => {
      if (event.type === "play") wantsToPlay.current = true;
      if (event.type === "pause") wantsToPlay.current = false;
      setPlaying(!video.paused);
      setSpeed(video.playbackRate);
      setMuted(video.muted);
    };
    const events = ["play", "pause", "ratechange", "volumechange"] as const;
    events.forEach((name) => video.addEventListener(name, sync));
    const onFullscreen = () => setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      events.forEach((name) => video.removeEventListener(name, sync));
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, []);

  // Presigned URLs expire (10 min). When the browser then fails to fetch more
  // of the video, get fresh URLs and continue from the same position.
  async function onVideoError() {
    const video = videoRef.current;
    if (!video || Date.now() - lastRefresh.current < 30_000) {
      setError("Playback failed. Reload the page to try again.");
      return;
    }
    lastRefresh.current = Date.now();
    resumeAt.current = { time: video.currentTime, play: wantsToPlay.current };
    const response = await fetch(`/api/assets/${assetId}/versions/${versionId}/playback`);
    if (!response.ok) {
      setError("Playback failed. Reload the page to try again.");
      return;
    }
    setUrls((await response.json()) as PlaybackUrls);
  }

  // src is set here rather than as a JSX prop: re-signing the same key within
  // the same second yields the *same* URL string, and React wouldn't touch an
  // unchanged prop, so the video would never reload after an error. Assigning
  // src always restarts loading; a new `urls` object = a reload.
  useEffect(() => {
    const video = videoRef.current;
    if (video && urls.videoUrl) video.src = urls.videoUrl;
  }, [urls]);

  function onLoadedMetadata() {
    const video = videoRef.current;
    const resume = resumeAt.current;
    if (!video || !resume) return;
    resumeAt.current = null;
    video.currentTime = resume.time;
    if (resume.play) void video.play();
  }

  function toggleFullscreen() {
    // The container goes fullscreen, not the <video>, so our controls (and
    // later the annotation layer) come along.
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  }

  // Global shortcuts, ignored while typing (comment box etc.).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const video = videoRef.current;
      const target = event.target as HTMLElement;
      if (!video || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target.closest("input, textarea, select, [contenteditable=true], dialog")) return;
      // Space/Enter on a focused button should press that button, not toggle twice.
      if ((event.key === " " || event.key === "Enter") && target.closest("button")) return;

      const handled = (() => {
        switch (event.key) {
          case " ":
          case "k":
          case "K":
            if (event.key === " ") togglePlay(video);
            else video.pause();
            return true;
          case "l":
          case "L":
            // Browsers can't play MP4 backwards, so J/K/L is: J back 1 s,
            // K pause, L play (again for 2×).
            if (video.paused) {
              video.playbackRate = 1;
              void video.play();
            } else {
              video.playbackRate = Math.min(2, video.playbackRate * 2);
            }
            return true;
          case "j":
          case "J":
            seekTo(video, video.currentTime - 1);
            return true;
          case ",":
            stepFrames(video, rate, -1);
            return true;
          case ".":
            stepFrames(video, rate, 1);
            return true;
          case "ArrowLeft":
            seekTo(video, video.currentTime - 5);
            return true;
          case "ArrowRight":
            seekTo(video, video.currentTime + 5);
            return true;
          case "f":
          case "F":
            toggleFullscreen();
            return true;
          case "m":
          case "M":
            video.muted = !video.muted;
            return true;
          case "?":
            dialogRef.current?.showModal();
            return true;
          default:
            return false;
        }
      })();
      if (handled) event.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rate]);

  return (
    <PlayerContext value={{ videoRef, rate, durationSeconds }}>
      <div
        ref={containerRef}
        className={`flex flex-col overflow-hidden bg-black ${fullscreen ? "h-screen w-screen" : "rounded-md"}`}
      >
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <video
            ref={videoRef}
            poster={urls.posterUrl ?? undefined}
            preload="metadata"
            playsInline
            onClick={() => videoRef.current && togglePlay(videoRef.current)}
            onError={() => void onVideoError()}
            onLoadedMetadata={onLoadedMetadata}
            className={`w-full object-contain ${fullscreen ? "h-full" : "max-h-[70vh]"}`}
          />
          {error && (
            <p role="alert" className="absolute inset-x-0 bottom-4 text-center text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-3 py-2 text-white">
          <Timeline />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => videoRef.current && togglePlay(videoRef.current)}
              aria-label={playing ? "Pause" : "Play"}
              className="w-14 text-left"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" aria-label="Previous frame" onClick={() => videoRef.current && stepFrames(videoRef.current, rate, -1)}>
              ‹
            </button>
            <button type="button" aria-label="Next frame" onClick={() => videoRef.current && stepFrames(videoRef.current, rate, 1)}>
              ›
            </button>
            <TimecodeDisplay />
            <span className="text-xs text-neutral-400">{rate.fps.toFixed(rate.fps % 1 === 0 ? 0 : 3)} fps</span>
            <span className="flex-1" />
            <label className="flex items-center gap-1 text-xs">
              <span className="sr-only">Speed</span>
              <select
                value={speed}
                onChange={(event) => {
                  if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value);
                }}
                className="rounded bg-white/10 px-1 py-0.5"
              >
                {SPEEDS.map((value) => (
                  <option key={value} value={value} className="text-black">
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
              }}
              aria-pressed={muted}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen}>
              {fullscreen ? "Exit fullscreen" : "Fullscreen"}
            </button>
            <button type="button" onClick={() => dialogRef.current?.showModal()} aria-label="Keyboard shortcuts">
              ?
            </button>
          </div>
        </div>
      </div>
      <ShortcutsDialog dialogRef={dialogRef} />
    </PlayerContext>
  );
}
