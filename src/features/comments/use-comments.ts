"use client";

import { startTransition, useOptimistic, useState } from "react";
import type { Shape } from "@/features/annotations/schema";
import { useProjectEvent } from "@/features/processing/components/project-events";
import {
  applyCommentChange,
  applyMarkerChange,
  type ClientComment,
  type CommentChange,
  type Marker,
} from "./comment-changes";
import type { CommentDto, CommentPage } from "./schema";

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; details?: { current?: CommentDto | null } };

async function api<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    if (response.status === 204) return { ok: true, data: undefined as T };
    const data = await response.json();
    if (response.ok) return { ok: true, data: data as T };
    return { ok: false, status: response.status, message: data?.error?.message ?? "Something went wrong.", details: data?.error?.details };
  } catch {
    return { ok: false, status: 0, message: "You're offline. Try again." };
  }
}

export type NewComment = {
  body: string;
  mentions: string[];
  timecodeMs: number | null;
  rangeEndMs: number | null;
  annotation: Shape[] | null;
  parentId: string | null;
};

// Comment list state for one version: first page from the server render,
// more pages on demand, live updates over SSE, and the mutations.
export function useComments(props: {
  versionId: string;
  initialPage: CommentPage;
  initialMarkers: Marker[];
  author: { id: string; name: string };
}) {
  const [threads, setThreads] = useState<ClientComment[]>(props.initialPage.comments);
  const [markers, setMarkers] = useState(props.initialMarkers);
  const [nextCursor, setNextCursor] = useState(props.initialPage.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Optimistic layer on top of `threads`: shown while a create is in flight,
  // dropped automatically when it ends (the saved comment is in `threads` by
  // then, or nothing is if it failed: that's the rollback).
  const [visibleThreads, addOptimistic] = useOptimistic(threads, applyCommentChange);

  const apply = (change: CommentChange) => {
    setThreads((prev) => applyCommentChange(prev, change));
    setMarkers((prev) => applyMarkerChange(prev, change));
  };

  useProjectEvent((event) => {
    if (event.type !== "comment" || event.versionId !== props.versionId) return;
    apply(
      event.action === "upserted"
        ? { type: "upsert", comment: event.comment }
        : { type: "delete", id: event.commentId, parentId: event.parentId },
    );
  });

  // Resolves with an error message, or null on success, so the form knows
  // whether to give the user their text back.
  function create(input: NewComment): Promise<string | null> {
    const id = crypto.randomUUID();
    const optimistic: ClientComment = {
      id,
      versionId: props.versionId,
      parentId: input.parentId,
      author: props.author,
      body: input.body,
      timecodeMs: input.parentId ? null : input.timecodeMs,
      rangeEndMs: input.parentId || input.timecodeMs === null ? null : input.rangeEndMs,
      annotation: input.parentId || input.timecodeMs === null ? null : input.annotation,
      mentions: input.mentions,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
      editedAt: null,
      revision: 1,
      replies: [],
      pending: true,
    };

    return new Promise((resolve) => {
      startTransition(async () => {
        addOptimistic({ type: "upsert", comment: optimistic });
        const result = await api<CommentDto>(`/api/versions/${props.versionId}/comments`, {
          method: "POST",
          body: JSON.stringify({ id, ...input }),
        });
        // State updates after an await need their own transition to stay in this action.
        startTransition(() => {
          if (result.ok) apply({ type: "upsert", comment: result.data });
        });
        resolve(result.ok ? null : result.message);
      });
    });
  }

  // Edits, resolve and delete send If-Match. On 412 someone else changed the
  // comment first: show their version instead of silently overwriting it.
  async function mutate(comment: ClientComment, method: "PATCH" | "DELETE", body?: object): Promise<string | null> {
    const result = await api<CommentDto>(`/api/comments/${comment.id}`, {
      method,
      headers: { "If-Match": `"${comment.revision}"` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (result.ok) {
      apply(method === "DELETE" ? { type: "delete", id: comment.id, parentId: comment.parentId } : { type: "upsert", comment: result.data });
      return null;
    }
    if (result.status === 412) {
      // Handled, not failed: the list now shows the latest version and the
      // notice says why. (An open edit form closes; the user can edit again.)
      const current = result.details?.current;
      apply(current ? { type: "upsert", comment: current } : { type: "delete", id: comment.id, parentId: comment.parentId });
      setNotice(result.message);
      return null;
    }
    return result.message;
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    const result = await api<CommentPage>(
      `/api/versions/${props.versionId}/comments?cursor=${encodeURIComponent(nextCursor)}`,
    );
    setLoadingMore(false);
    if (!result.ok) return setNotice(result.message);
    apply({ type: "append-page", comments: result.data.comments });
    setNextCursor(result.data.nextCursor);
  }

  return {
    threads: visibleThreads,
    markers,
    nextCursor,
    loadingMore,
    notice,
    dismissNotice: () => setNotice(null),
    create,
    edit: (comment: ClientComment, body: string, mentions: string[]) => mutate(comment, "PATCH", { body, mentions }),
    setResolved: (comment: ClientComment, resolved: boolean) => mutate(comment, "PATCH", { resolved }),
    remove: (comment: ClientComment) => mutate(comment, "DELETE"),
    loadMore,
  };
}

export type CommentsApi = ReturnType<typeof useComments>;
