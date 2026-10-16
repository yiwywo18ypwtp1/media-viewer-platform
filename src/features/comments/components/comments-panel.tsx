"use client";

import { useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/form";
import { useOptionalPlayer } from "@/features/player/player-context";
import { formatTimecode } from "@/features/player/timecode";
import { useI18n } from "@/i18n/client";
import type { ClientComment } from "../comment-changes";
import type { Member } from "../schema";
import type { CommentsApi } from "../use-comments";
import { CommentBody } from "./comment-body";
import { CommentForm } from "./comment-form";

type Props = {
  comments: CommentsApi;
  members: Member[];
  currentUserId: string;
  canComment: boolean;
  draftKey: string;
  isVideo: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  // All comments of the version as a CSV download.
  exportUrl: string;
};

// The thread list. Re-renders when comments change, never during playback:
// it doesn't read the player's time, only seeks when asked to.
export function CommentsPanel(props: Props) {
  const { comments } = props;
  const { t, tm } = useI18n();
  const openCount = comments.threads.filter((thread) => !thread.resolvedAt).length;

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {t.comments.title} <span className="font-normal text-neutral-500">{t.comments.open(openCount)}</span>
        </h2>
        {comments.threads.length > 0 && (
          <a href={props.exportUrl} download className="text-xs underline">
            {t.comments.exportCsv}
          </a>
        )}
      </div>

      {comments.notice && (
        <div role="status" className="flex justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {tm(comments.notice)}
          <button type="button" className="underline" onClick={comments.dismissNotice}>
            {t.comments.ok}
          </button>
        </div>
      )}

      {props.canComment && (
        <CommentForm
          members={props.members}
          submitLabel={t.comments.comment}
          withTimecode={props.isVideo}
          draftKey={props.draftKey}
          onSubmit={(values) => comments.create({ ...values, parentId: null })}
        />
      )}

      {comments.threads.length === 0 ? (
        <p className="text-sm text-neutral-500">{t.comments.none}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {comments.threads.map((thread) => (
            <Thread key={thread.id} thread={thread} {...props} />
          ))}
        </ol>
      )}

      {comments.nextCursor && (
        <button type="button" className="self-start text-sm underline" disabled={comments.loadingMore} onClick={comments.loadMore}>
          {comments.loadingMore ? t.comments.loading : t.comments.loadMore}
        </button>
      )}
    </section>
  );
}

function Thread({ thread, ...props }: Props & { thread: ClientComment }) {
  const { t } = useI18n();
  const [replying, setReplying] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const selected = props.selectedId === thread.id;

  // A marker click (or a link to #comment-...) brings its thread into view.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <li
      ref={ref}
      id={`comment-${thread.id}`}
      className={`rounded-md border px-3 py-2 ${
        selected ? "border-amber-400 bg-amber-50/50 dark:bg-amber-950/30" : "border-neutral-200 dark:border-neutral-800"
      } ${thread.resolvedAt ? "opacity-60" : ""}`}
    >
      <CommentItem comment={thread} {...props} />

      {thread.replies.length > 0 && (
        <ol className="mt-2 flex flex-col gap-2 border-l border-neutral-200 pl-3 dark:border-neutral-800">
          {thread.replies.map((reply) => (
            <li key={reply.id} id={`comment-${reply.id}`}>
              <CommentItem comment={reply} {...props} />
            </li>
          ))}
        </ol>
      )}

      {props.canComment && !thread.pending && (
        <div className="mt-2 flex gap-3 text-xs">
          {!replying && (
            <button type="button" className="underline" onClick={() => setReplying(true)}>
              {t.comments.reply}
            </button>
          )}
          <button
            type="button"
            className="underline"
            onClick={() => void props.comments.setResolved(thread, !thread.resolvedAt)}
          >
            {thread.resolvedAt ? t.comments.reopen : t.comments.resolve}
          </button>
        </div>
      )}

      {replying && (
        <div className="mt-2">
          <CommentForm
            members={props.members}
            submitLabel={t.comments.reply}
            autoFocus
            onSubmit={async (values) => {
              const error = await props.comments.create({
                ...values,
                timecodeMs: null,
                rangeEndMs: null,
                annotation: null,
                parentId: thread.id,
              });
              if (!error) setReplying(false);
              return error;
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
    </li>
  );
}

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function CommentItem({ comment, ...props }: Props & { comment: ClientComment }) {
  const player = useOptionalPlayer();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAuthor = comment.author.id === props.currentUserId;

  if (editing) {
    return (
      <CommentForm
        members={props.members}
        submitLabel={t.comments.save}
        autoFocus
        initial={{ body: comment.body, mentions: comment.mentions }}
        onSubmit={async (values) => {
          const failure = await props.comments.edit(comment, values.body, values.mentions);
          if (!failure) setEditing(false);
          return failure;
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article className="flex flex-col gap-1" aria-busy={comment.pending}>
      <header className="flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-500">
        <span className="font-medium text-neutral-900 dark:text-neutral-100">{comment.author.name}</span>
        {comment.timecodeMs !== null && player && (
          <button
            type="button"
            onClick={() => props.onSelect(comment.id)}
            className="font-mono text-blue-700 underline dark:text-blue-400"
            aria-label={`${t.comments.goTo(formatTimecode(comment.timecodeMs / 1000, player.rate))}${
              comment.rangeEndMs !== null ? t.comments.rangeUntil(formatTimecode(comment.rangeEndMs / 1000, player.rate)) : ""
            }`}
          >
            {formatTimecode(comment.timecodeMs / 1000, player.rate)}
            {comment.rangeEndMs !== null && `–${formatTimecode(comment.rangeEndMs / 1000, player.rate)}`}
          </button>
        )}
        {/* Local time zone in the browser; may differ from the server render. */}
        <time dateTime={comment.createdAt} suppressHydrationWarning>
          {timeFormat.format(new Date(comment.createdAt))}
        </time>
        {comment.author.id === null && <span>{t.comments.guest}</span>}
        {comment.annotation && <span title={t.comments.hasDrawing}>{t.comments.drawing}</span>}
        {comment.editedAt && <span>{t.comments.edited}</span>}
        {comment.pending && <span>{t.comments.sendingState}</span>}
        {comment.resolvedAt && <span className="text-green-700 dark:text-green-500">{t.comments.resolved}</span>}
      </header>
      <CommentBody body={comment.body} mentions={comment.mentions} members={props.members} />
      {isAuthor && !comment.pending && (
        <div className="flex gap-3 text-xs">
          <button type="button" className="underline" onClick={() => setEditing(true)}>
            {t.comments.edit}
          </button>
          <button
            type="button"
            className="underline"
            onClick={async () => {
              if (window.confirm(t.comments.confirmDelete)) setError(await props.comments.remove(comment));
            }}
          >
            {t.comments.delete}
          </button>
        </div>
      )}
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </article>
  );
}
