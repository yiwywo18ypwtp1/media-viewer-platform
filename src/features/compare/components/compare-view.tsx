"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { CommentBody } from "@/features/comments/components/comment-body";
import type { CommentDto, Member } from "@/features/comments/schema";
import type { PlaybackUrls } from "@/features/player/playback";
import { seekTo, stepFrames, togglePlay } from "@/features/player/player-context";
import { formatTimecode, frameRate, type FrameRate } from "@/features/player/timecode";
import { useVideoSource } from "@/features/player/use-video-source";
import { useVideoTime } from "@/features/player/use-video-time";
import { useI18n } from "@/i18n/client";
import { followerTarget } from "../sync";

export type CompareSide = {
  number: number;
  urls: PlaybackUrls;
  fps: number | null;
  durationMs: number;
  comments: CommentDto[];
};

type Props = { kind: "video" | "image"; left: CompareSide; right: CompareSide; members: Member[] };
type Mode = "side" | "wipe";

// Two versions in sync. The longer video leads (so every moment of either
// version can be reached): every control acts on it, and the other one
// follows its play/pause and time (see followerTarget). Sound comes from the
// leader only; two soundtracks at once help nobody.
export function CompareView({ kind, left, right, members }: Props) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("side");
  const [wipe, setWipe] = useState(50);
  const leftRef = useRef<HTMLVideoElement>(null);
  const rightRef = useRef<HTMLVideoElement>(null);
  const seekRef = useRef<HTMLInputElement>(null);
  const leftTimeRef = useRef<HTMLSpanElement>(null);
  const rightTimeRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  const leftRate = frameRate(left.fps ?? 25);
  const rightRate = frameRate(right.fps ?? 25);

  const leaderSide = left.durationMs >= right.durationMs ? "left" : "right";
  const leaderRef = leaderSide === "left" ? leftRef : rightRef;
  const followerRef = leaderSide === "left" ? rightRef : leftRef;
  const leaderRate = leaderSide === "left" ? leftRate : rightRate;
  const duration = Math.max(left.durationMs, right.durationMs) / 1000;

  // Follow the leader's time: every frame while playing, and after each seek
  // or pause. Written to the DOM directly, like the main player's timeline.
  useVideoTime(leaderRef, (seconds) => {
    const follower = followerRef.current;
    const leader = leaderRef.current;
    if (follower && leader) {
      const target = followerTarget(seconds, { time: follower.currentTime, duration: follower.duration }, !leader.paused);
      if (target !== null) follower.currentTime = target;
    }
    if (seekRef.current) seekRef.current.value = String(seconds);
  });
  // Each side's own timecode, at its own frame rate.
  useVideoTime(leftRef, (seconds) => {
    if (leftTimeRef.current) leftTimeRef.current.textContent = formatTimecode(seconds, leftRate);
  });
  useVideoTime(rightRef, (seconds) => {
    if (rightTimeRef.current) rightTimeRef.current.textContent = formatTimecode(seconds, rightRate);
  });

  // ...and its play/pause.
  useEffect(() => {
    const leader = leaderRef.current;
    if (!leader) return;
    const onPlay = () => {
      setPlaying(true);
      void followerRef.current?.play().catch(() => {});
    };
    const onPause = () => {
      setPlaying(false);
      followerRef.current?.pause();
    };
    leader.addEventListener("play", onPlay);
    leader.addEventListener("pause", onPause);
    return () => {
      leader.removeEventListener("play", onPlay);
      leader.removeEventListener("pause", onPause);
    };
  }, [leaderRef, followerRef]);

  // Space, frame steps and ±5 s, as in the player.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const video = leaderRef.current;
      const target = event.target as HTMLElement;
      if (!video || event.ctrlKey || event.metaKey || event.altKey) return;
      if (target.closest("input:not([type=range]), textarea, select, button")) return;
      const actions: Record<string, () => void> = {
        " ": () => togglePlay(video),
        ",": () => stepFrames(video, leaderRate, -1),
        ".": () => stepFrames(video, leaderRate, 1),
        ArrowLeft: () => seekTo(video, video.currentTime - 5),
        ArrowRight: () => seekTo(video, video.currentTime + 5),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leaderRef, leaderRate]);

  const seekBoth = (seconds: number) => {
    const video = leaderRef.current;
    if (!video) return;
    video.pause();
    seekTo(video, seconds);
  };

  const media = (side: "left" | "right") => {
    const data = side === "left" ? left : right;
    if (kind === "image") {
      // eslint-disable-next-line @next/next/no-img-element -- presigned URL, already resized by the worker
      return <img src={data.urls.imageUrl ?? undefined} alt={`Version ${data.number}`} className="h-full w-full object-contain" />;
    }
    return (
      <SyncedVideo
        videoRef={side === "left" ? leftRef : rightRef}
        urls={data.urls}
        // Sound from the leader only.
        muted={side !== leaderSide}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label={t.compare.mode}>
        {(["side", "wipe"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`rounded px-2 py-1 ${mode === value ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
          >
            {value === "side" ? t.compare.side : t.compare.wipe}
          </button>
        ))}
        {mode === "wipe" && (
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            v{left.number}
            <input type="range" min={0} max={100} value={wipe} onChange={(event) => setWipe(Number(event.target.value))} aria-label={t.compare.wipePosition} />
            v{right.number}
          </label>
        )}
      </div>

      {/* One element tree for both modes, only the layout changes: switching
          modes must not remount the videos (they'd lose position and sync). */}
      <div className={mode === "side" ? "grid gap-2 md:grid-cols-2" : "relative aspect-video overflow-hidden rounded-md bg-black"}>
        {(["right", "left"] as const).map((side) => (
          <figure
            key={side}
            // Side by side: left first. Wipe: the left picture on top, cut at the wipe.
            className={mode === "side" ? `flex flex-col gap-1 ${side === "left" ? "order-first" : ""}` : "absolute inset-0"}
            style={mode === "wipe" && side === "left" ? { clipPath: `inset(0 ${100 - wipe}% 0 0)` } : undefined}
          >
            <div className={mode === "side" ? "aspect-video overflow-hidden rounded-md bg-black" : "h-full w-full"}>{media(side)}</div>
            <figcaption
              className={mode === "side" ? "text-xs text-neutral-500" : `absolute top-2 rounded bg-black/60 px-1 text-xs text-white ${side === "left" ? "left-2" : "right-2"}`}
            >
              v{(side === "left" ? left : right).number}
            </figcaption>
          </figure>
        ))}
        {mode === "wipe" && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white" style={{ left: `${wipe}%` }} />
        )}
      </div>

      {kind === "video" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className="w-14 text-left" onClick={() => leaderRef.current && togglePlay(leaderRef.current)}>
            {playing ? t.player.pause : t.player.play}
          </button>
          <button type="button" aria-label={t.player.previousFrame} onClick={() => leaderRef.current && stepFrames(leaderRef.current, leaderRate, -1)}>
            ‹
          </button>
          <button type="button" aria-label={t.player.nextFrame} onClick={() => leaderRef.current && stepFrames(leaderRef.current, leaderRate, 1)}>
            ›
          </button>
          <input
            ref={seekRef}
            type="range"
            min={0}
            max={duration}
            step="any"
            defaultValue={0}
            aria-label={t.compare.seekBoth}
            onChange={(event) => seekBoth(Number(event.target.value))}
            className="min-w-40 flex-1"
          />
          <span className="font-mono text-xs">
            v{left.number} <span ref={leftTimeRef} /> · v{right.number} <span ref={rightTimeRef} />
          </span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <CommentList side={left} rate={leftRate} members={members} onSeek={kind === "video" ? seekBoth : undefined} />
        <CommentList side={right} rate={rightRate} members={members} onSeek={kind === "video" ? seekBoth : undefined} />
      </div>
    </div>
  );
}

function SyncedVideo({ videoRef, urls, muted }: { videoRef: RefObject<HTMLVideoElement | null>; urls: PlaybackUrls; muted: boolean }) {
  useVideoSource(videoRef, urls);
  return (
    <video
      ref={videoRef}
      poster={urls.posterUrl ?? undefined}
      preload="auto"
      playsInline
      muted={muted}
      className="h-full w-full object-contain"
    />
  );
}

// Each version's comments on its own side. Timecodes seek both videos.
function CommentList(props: { side: CompareSide; rate: FrameRate; members: Member[]; onSeek?: (seconds: number) => void }) {
  const { side, rate } = props;
  const { t } = useI18n();
  return (
    <section aria-label={t.compare.commentsOn(side.number)} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{t.compare.commentsOn(side.number)}</h2>
      {side.comments.length === 0 && <p className="text-sm text-neutral-500">{t.compare.noComments}</p>}
      <ol className="flex flex-col gap-2">
        {side.comments.map((comment) => (
          <li key={comment.id} className={`rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800 ${comment.resolvedAt ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-2 text-xs text-neutral-500">
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{comment.author.name}</span>
              {comment.timecodeMs !== null && props.onSeek && (
                <button type="button" className="font-mono text-blue-700 underline dark:text-blue-400" onClick={() => props.onSeek!(comment.timecodeMs! / 1000)}>
                  {formatTimecode(comment.timecodeMs / 1000, rate)}
                  {comment.rangeEndMs !== null && `–${formatTimecode(comment.rangeEndMs / 1000, rate)}`}
                </button>
              )}
              {comment.replies.length > 0 && <span>{t.comments.repliesCount(comment.replies.length)}</span>}
            </div>
            <CommentBody body={comment.body} mentions={comment.mentions} members={props.members} />
          </li>
        ))}
      </ol>
    </section>
  );
}
