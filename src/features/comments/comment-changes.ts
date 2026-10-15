import type { CommentDto } from "./schema";

// One place that applies any change to the list of threads, whatever its
// source: the optimistic copy, the API response, a realtime event from another
// user, or the next page. Upserting by id makes them all idempotent: the same
// comment arriving from the API *and* over SSE ends up in the list once.

export type ClientComment = CommentDto & { pending?: boolean };

export type CommentChange =
  | { type: "upsert"; comment: ClientComment }
  | { type: "delete"; id: string; parentId: string | null }
  | { type: "append-page"; comments: CommentDto[] };

function upsertById(list: ClientComment[], comment: ClientComment): ClientComment[] {
  const index = list.findIndex((item) => item.id === comment.id);
  if (index === -1) return [...list, comment];
  // An older event arriving late must not overwrite a newer revision.
  if (!comment.pending && comment.revision < list[index].revision) return list;
  // Updates without replies (e.g. an edit echo) keep the replies we have.
  const replies = comment.replies.length > 0 ? comment.replies : list[index].replies;
  return list.with(index, { ...comment, replies });
}

export function applyCommentChange(threads: ClientComment[], change: CommentChange): ClientComment[] {
  switch (change.type) {
    case "upsert": {
      const { comment } = change;
      if (!comment.parentId) return upsertById(threads, comment);
      // A reply to a thread that isn't loaded (later page) is skipped; it
      // comes with its thread when that page loads.
      return threads.map((thread) =>
        thread.id === comment.parentId ? { ...thread, replies: upsertById(thread.replies, comment) } : thread,
      );
    }
    case "delete":
      if (!change.parentId) return threads.filter((thread) => thread.id !== change.id);
      return threads.map((thread) =>
        thread.id === change.parentId
          ? { ...thread, replies: thread.replies.filter((reply) => reply.id !== change.id) }
          : thread,
      );
    case "append-page": {
      // Threads that arrived over SSE before their page was loaded are kept once.
      const known = new Set(threads.map((thread) => thread.id));
      return [...threads, ...change.comments.filter((comment) => !known.has(comment.id))];
    }
  }
}

// Timeline markers follow the same changes: a top-level comment with a
// timecode is a marker; replies and comments without timecode aren't.
export type Marker = { id: string; timeMs: number; resolved: boolean; label: string };

export function applyMarkerChange(markers: Marker[], change: CommentChange): Marker[] {
  if (change.type === "delete") return markers.filter((marker) => marker.id !== change.id);
  if (change.type !== "upsert" || change.comment.parentId || change.comment.timecodeMs === null) return markers;
  const { comment } = change;
  const marker: Marker = {
    id: comment.id,
    timeMs: comment.timecodeMs!,
    resolved: comment.resolvedAt !== null,
    label: `${comment.author.name}: ${comment.body.slice(0, 80)}`,
  };
  const index = markers.findIndex((m) => m.id === comment.id);
  return index === -1 ? [...markers, marker] : markers.with(index, marker);
}
