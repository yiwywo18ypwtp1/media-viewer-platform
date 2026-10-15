"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Player } from "@/features/player/components/player";
import type { PlaybackUrls } from "@/features/player/playback";
import { PlayerProvider, seekTo, useOptionalPlayer } from "@/features/player/player-context";
import type { Marker } from "../comment-changes";
import type { CommentPage, Member } from "../schema";
import { useComments } from "../use-comments";
import { CommentsPanel } from "./comments-panel";

type Props = {
  assetId: string;
  versionId: string;
  // A playable video, or null for images / unprocessed versions (then `media` is shown).
  video: { urls: PlaybackUrls; fps: number | null; durationMs: number } | null;
  media: ReactNode;
  initialPage: CommentPage;
  initialMarkers: Marker[];
  members: Member[];
  currentUser: { id: string; name: string };
  canComment: boolean;
};

// The asset page's client island: player + comments, which need each other
// (markers on the timeline, timecodes that seek the video). The player context
// wraps both so the comment form can read the current frame.
export function ReviewWorkspace(props: Props) {
  if (!props.video) return <Workspace {...props} />;
  return (
    <PlayerProvider fps={props.video.fps} durationMs={props.video.durationMs}>
      <Workspace {...props} />
    </PlayerProvider>
  );
}

function Workspace(props: Props) {
  const player = useOptionalPlayer();
  const comments = useComments({
    versionId: props.versionId,
    initialPage: props.initialPage,
    initialMarkers: props.initialMarkers,
    author: props.currentUser,
  });
  const [clickedId, setClickedId] = useState<string | null>(null);
  // Links from mention emails end in #comment-<id>. Read like any browser
  // state: null during the server render, the real hash after hydration.
  const hashId = useSyncExternalStore(subscribeToHash, commentIdFromHash, () => null);
  const selectedId = clickedId ?? hashId;

  // Clicking a marker or a timecode: jump to that frame (paused, to look at
  // it) and highlight the thread. Markers cover every comment, so this works
  // even for threads on pages not loaded yet.
  function select(id: string) {
    const marker = comments.markers.find((m) => m.id === id);
    const video = player?.videoRef.current;
    if (marker && video) {
      video.pause();
      seekTo(video, marker.timeMs / 1000);
    }
    setClickedId(id);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        {props.video ? (
          <Player
            key={props.versionId}
            assetId={props.assetId}
            versionId={props.versionId}
            initialUrls={props.video.urls}
            markers={comments.markers}
            onMarkerSelect={select}
          />
        ) : (
          props.media
        )}
      </div>
      <CommentsPanel
        comments={comments}
        members={props.members}
        currentUserId={props.currentUser.id}
        canComment={props.canComment}
        // Per asset, not per version: a draft survives switching versions.
        draftKey={`comment-draft:${props.assetId}`}
        isVideo={Boolean(props.video)}
        selectedId={selectedId}
        onSelect={select}
      />
    </div>
  );
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function commentIdFromHash() {
  return /^#comment-([0-9a-f-]{36})$/.exec(window.location.hash)?.[1] ?? null;
}
