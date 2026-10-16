"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { Button, FormMessage, Input } from "@/components/form";
import { AnnotationLayer } from "@/features/annotations/components/annotation-layer";
import type { Shape } from "@/features/annotations/schema";
import { applyCommentChange, applyMarkerChange, type Marker } from "@/features/comments/comment-changes";
import { CommentBody } from "@/features/comments/components/comment-body";
import { CommentForm } from "@/features/comments/components/comment-form";
import type { CommentDto } from "@/features/comments/schema";
import { Player } from "@/features/player/components/player";
import type { PlaybackUrls } from "@/features/player/playback";
import { PlayerProvider, seekTo, useOptionalPlayer } from "@/features/player/player-context";
import { formatTimecode } from "@/features/player/timecode";
import { guestNameSchema } from "../schema";

type Props = {
  token: string;
  video: { urls: PlaybackUrls; fps: number | null; durationMs: number } | null;
  media: ReactNode;
  comments: CommentDto[];
  markers: Marker[];
  allowComments: boolean;
};

// What a guest sees through a share link: the player and the comments, and a
// comment form if the link allows it. No account, no mentions, no editing.
// Comments by others show up on reload (members get them live).
export function GuestReview(props: Props) {
  if (!props.video) return <GuestWorkspace {...props} />;
  return (
    <PlayerProvider fps={props.video.fps} durationMs={props.video.durationMs}>
      <GuestWorkspace {...props} />
    </PlayerProvider>
  );
}

function GuestWorkspace(props: Props) {
  const router = useRouter();
  const player = useOptionalPlayer();
  const [threads, setThreads] = useState(props.comments);
  const [markers, setMarkers] = useState(props.markers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const guestName = useGuestName();
  const [revoked, setRevoked] = useState(false);

  // Is the link still on? A revoke must stop an open page too, even with the
  // video already buffered (no more requests that could be refused).
  useEffect(() => {
    const timer = setInterval(async () => {
      const response = await fetch(`/s/${props.token}/status`, { cache: "no-store" }).catch(() => null);
      if (response?.status !== 404) return; // offline or a blip: ask again later
      clearInterval(timer);
      player?.videoRef.current?.pause();
      setRevoked(true);
    }, STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [props.token, player]);

  if (revoked) {
    return (
      <div role="alert" className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">This link was turned off</h2>
        <p className="text-sm text-neutral-500">You can no longer watch or comment here.</p>
      </div>
    );
  }

  function select(id: string) {
    const marker = markers.find((m) => m.id === id);
    const video = player?.videoRef.current;
    if (marker && video) {
      video.pause();
      seekTo(video, marker.timeMs / 1000);
    }
    setSelectedId(id);
  }

  async function post(values: { body: string; timecodeMs: number | null; rangeEndMs: number | null; annotation: Shape[] | null }) {
    const response = await fetch(`/s/${props.token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), parentId: null, guestName: guestName.value, ...values }),
    }).catch(() => null);
    if (!response) return "You're offline. Try again.";
    if (response.status === 404) {
      // Revoked or expired while open: the page will say so.
      router.refresh();
      return "This link is no longer available.";
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) return data?.error?.message ?? "Couldn't send the comment.";
    const change = { type: "upsert" as const, comment: data as CommentDto };
    setThreads((prev) => applyCommentChange(prev, change));
    setMarkers((prev) => applyMarkerChange(prev, change));
    return null;
  }

  const selected = threads.find((thread) => thread.id === selectedId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      {player && !player.drawing && selected?.annotation && selected.timecodeMs !== null && (
        <AnnotationLayer shapes={selected.annotation} atMs={selected.timecodeMs} />
      )}
      <div>
        {props.video ? (
          <Player refreshUrl={`/s/${props.token}/playback`} initialUrls={props.video.urls} markers={markers} onMarkerSelect={select} />
        ) : (
          props.media
        )}
      </div>

      <section aria-label="Comments" className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Comments</h2>
        {props.allowComments &&
          (guestName.value ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-neutral-500">
                Commenting as <span className="font-medium text-neutral-900 dark:text-neutral-100">{guestName.value}</span>{" "}
                <button type="button" className="underline" onClick={() => guestName.set(null)}>
                  change
                </button>
              </p>
              <CommentForm
                members={[]}
                submitLabel="Comment"
                withTimecode={Boolean(props.video)}
                draftKey={`guest-comment-draft:${props.token}`}
                // Guests have no member list, so the form's mentions are always empty.
                onSubmit={(values) => post({ body: values.body, timecodeMs: values.timecodeMs, rangeEndMs: values.rangeEndMs, annotation: values.annotation })}
              />
            </div>
          ) : (
            <GuestNameForm onSave={guestName.set} />
          ))}

        {threads.length === 0 ? (
          <p className="text-sm text-neutral-500">No comments yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {threads.map((thread) => (
              <li
                key={thread.id}
                className={`flex flex-col gap-2 rounded-md border px-3 py-2 ${
                  thread.id === selectedId ? "border-amber-400" : "border-neutral-200 dark:border-neutral-800"
                } ${thread.resolvedAt ? "opacity-60" : ""}`}
              >
                <GuestComment comment={thread} onSelect={select} />
                {thread.replies.map((reply) => (
                  <div key={reply.id} className="border-l border-neutral-200 pl-3 dark:border-neutral-800">
                    <GuestComment comment={reply} onSelect={select} />
                  </div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function GuestComment({ comment, onSelect }: { comment: CommentDto; onSelect: (id: string) => void }) {
  const player = useOptionalPlayer();
  return (
    <article className="flex flex-col gap-1">
      <header className="flex flex-wrap items-baseline gap-2 text-xs text-neutral-500">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{comment.author.name}</span>
        {comment.author.id === null && <span>(guest)</span>}
        {comment.timecodeMs !== null && player && (
          <button type="button" className="font-mono text-blue-700 underline dark:text-blue-400" onClick={() => onSelect(comment.id)}>
            {formatTimecode(comment.timecodeMs / 1000, player.rate)}
            {comment.rangeEndMs !== null && `–${formatTimecode(comment.rangeEndMs / 1000, player.rate)}`}
          </button>
        )}
        {comment.annotation && <span>✎ drawing</span>}
      </header>
      <CommentBody body={comment.body} mentions={[]} members={[]} />
    </article>
  );
}

function GuestNameForm({ onSave }: { onSave: (name: string) => void }) {
  const form = useForm({ resolver: zodResolver(guestNameSchema), defaultValues: { name: "" } });
  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(({ name }) => onSave(name))} noValidate className="flex flex-col gap-2">
      <label htmlFor="guest-name" className="text-sm">
        Your name, shown with your comments
      </label>
      <div className="flex gap-2">
        <Input id="guest-name" aria-invalid={Boolean(errors.name)} className="flex-1" {...form.register("name")} />
        <Button type="submit" className="px-3 py-1">
          Continue
        </Button>
      </div>
      {errors.name && <FormMessage tone="error">{errors.name.message}</FormMessage>}
    </form>
  );
}

const STATUS_POLL_MS = 10_000;

// The guest's name, remembered in this browser (localStorage) across visits.
const NAME_KEY = "guest-name";
const listeners = new Set<() => void>();

function useGuestName() {
  const value = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => {
      try {
        return localStorage.getItem(NAME_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const set = (name: string | null) => {
    try {
      if (name) localStorage.setItem(NAME_KEY, name);
      else localStorage.removeItem(NAME_KEY);
    } catch {}
    listeners.forEach((listener) => listener());
  };
  return { value, set };
}
