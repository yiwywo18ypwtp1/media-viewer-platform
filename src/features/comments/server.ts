import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { CurrentUser } from "@/features/auth/session";
import { getProjectAccess, listMembers } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";
import { isUuid } from "@/lib/ids";
import { ApiError } from "@/server/api";
import { getDb } from "@/server/db";
import { mentionEmail } from "@/server/emails";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { getEmailQueue } from "@/server/queues";
import { projectChannel, type CommentEvent } from "@/server/realtime";
import { getRedis } from "@/server/redis";
import { assets, assetVersions, comments, users } from "@/server/schema";
import type { Shape } from "@/features/annotations/schema";
import type { Marker } from "./comment-changes";
import { decodeCursor, encodeCursor } from "./cursor";
import {
  keepMentionsInBody,
  type CommentDto,
  type CommentPage,
  type createCommentSchema,
  type updateCommentSchema,
} from "./schema";

// Comment logic shared by the API routes and the asset page's first render.

const PAGE_SIZE = 20;

// --- Access ---

// A version is visible to members of its project. Returns what the comment
// operations need, or throws 404 (same answer for "missing" and "not yours").
export async function getVersionAccess(userId: string, versionId: unknown) {
  if (!isUuid(versionId)) throw new ApiError(404, "not_found", "Version not found.");
  const [version] = await getDb()
    .select({
      id: assetVersions.id,
      number: assetVersions.number,
      durationMs: assetVersions.durationMs,
      assetId: assets.id,
      assetName: assets.name,
      kind: assets.kind,
      projectId: assets.projectId,
    })
    .from(assetVersions)
    .innerJoin(assets, eq(assets.id, assetVersions.assetId))
    .where(eq(assetVersions.id, versionId))
    .limit(1);
  const access = version && (await getProjectAccess(userId, version.projectId));
  if (!access) throw new ApiError(404, "not_found", "Version not found.");
  return { version, role: access.role, workspaceId: access.workspace.id };
}

// --- Reading ---

const commentColumns = {
  id: comments.id,
  versionId: comments.versionId,
  parentId: comments.parentId,
  authorId: comments.authorId,
  // A member's current name, or the name a guest typed.
  authorName: sql<string>`coalesce(${users.name}, ${comments.guestName})`,
  body: comments.body,
  timecodeMs: comments.timecodeMs,
  rangeEndMs: comments.rangeEndMs,
  annotation: comments.annotation,
  mentions: comments.mentionedUserIds,
  resolvedAt: comments.resolvedAt,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
  revision: comments.revision,
};

type CommentRow = {
  id: string;
  versionId: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string;
  body: string;
  timecodeMs: number | null;
  rangeEndMs: number | null;
  annotation: Shape[] | null;
  mentions: string[];
  resolvedAt: Date | null;
  createdAt: Date;
  editedAt: Date | null;
  revision: number;
};

function toDto(row: CommentRow, replies: CommentDto[] = []): CommentDto {
  return {
    id: row.id,
    versionId: row.versionId,
    parentId: row.parentId,
    author: { id: row.authorId, name: row.authorName },
    body: row.body,
    timecodeMs: row.timecodeMs,
    rangeEndMs: row.rangeEndMs,
    annotation: row.annotation,
    mentions: row.mentions,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    revision: row.revision,
    replies,
  };
}

async function findComment(id: string): Promise<CommentRow | undefined> {
  const [row] = await getDb()
    .select(commentColumns)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, id))
    .limit(1);
  return row;
}

// Threads (top-level comments) in creation order, keyset-paginated; each page
// carries all replies of its threads.
export async function listComments(versionId: string, cursorParam: string | null): Promise<CommentPage> {
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && !cursor) throw new ApiError(400, "invalid_cursor", "Invalid cursor.");
  const db = getDb();

  const threads = await db
    .select(commentColumns)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(
      and(
        eq(comments.versionId, versionId),
        isNull(comments.parentId),
        cursor
          ? or(
              gt(comments.createdAt, cursor.createdAt),
              and(eq(comments.createdAt, cursor.createdAt), gt(comments.id, cursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(comments.createdAt), asc(comments.id))
    // One extra row tells us whether there's a next page.
    .limit(PAGE_SIZE + 1);

  const page = threads.slice(0, PAGE_SIZE);
  const replies = page.length
    ? await db
        .select(commentColumns)
        .from(comments)
        .leftJoin(users, eq(users.id, comments.authorId))
        .where(inArray(comments.parentId, page.map((t) => t.id)))
        .orderBy(asc(comments.createdAt), asc(comments.id))
    : [];

  const last = page.at(-1);
  return {
    comments: page.map((thread) =>
      toDto(
        thread,
        replies.filter((r) => r.parentId === thread.id).map((r) => toDto(r)),
      ),
    ),
    nextCursor: threads.length > PAGE_SIZE && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

// Every timecoded thread of a version, for the timeline. Separate from the
// paginated list: the timeline shows all comments (hundreds of markers are a
// few KB), the panel loads threads page by page.
export async function listMarkers(versionId: string): Promise<Marker[]> {
  const rows = await getDb()
    .select({
      id: comments.id,
      timeMs: comments.timecodeMs,
      endMs: comments.rangeEndMs,
      resolvedAt: comments.resolvedAt,
      authorName: sql<string>`coalesce(${users.name}, ${comments.guestName})`,
      body: comments.body,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.versionId, versionId), isNull(comments.parentId), isNotNull(comments.timecodeMs)))
    .orderBy(asc(comments.timecodeMs));
  return rows.map((row) => ({
    id: row.id,
    timeMs: row.timeMs!,
    endMs: row.endMs,
    resolved: row.resolvedAt !== null,
    label: markerLabel(row.authorName, row.body),
  }));
}

function markerLabel(authorName: string, body: string) {
  return `${authorName}: ${body.slice(0, 80)}`;
}

// --- Writing ---

async function publish(projectId: string, event: CommentEvent) {
  // Best effort: the comment is saved; if Redis is down, others see it on reload.
  await getRedis()
    .publish(projectChannel(projectId), JSON.stringify(event))
    .catch((error) => logger.warn({ err: error }, "failed to publish comment event"));
}

export async function createComment(
  user: CurrentUser,
  versionId: string,
  input: z.infer<typeof createCommentSchema>,
): Promise<CommentDto> {
  const { version, role, workspaceId } = await getVersionAccess(user.id, versionId);
  if (!can(role, "comment")) throw new ApiError(403, "forbidden", "Viewers can't comment.");
  const placement = await placeComment(version, input);

  const members = (await listMembers(workspaceId)).map((m) => ({ id: m.userId, name: m.name, email: m.email }));
  const mentions = keepMentionsInBody(input.body, input.mentions, members);

  const { dto, created } = await insertComment(version, input, placement, { authorId: user.id, mentionedUserIds: mentions });
  if (created) {
    await publish(version.projectId, { type: "comment", action: "upserted", versionId: version.id, comment: dto });
    await notifyMentions(user, mentions, members, version, dto);
  }
  return dto;
}

// A guest's comment through a share link (the caller checked the link allows
// comments). Shown to members like any other comment, live.
export async function createGuestComment(
  link: { id: string },
  version: Awaited<ReturnType<typeof getVersionAccess>>["version"],
  input: z.infer<typeof createCommentSchema> & { guestName: string },
): Promise<CommentDto> {
  const placement = await placeComment(version, input);
  const { dto, created } = await insertComment(version, input, placement, {
    authorId: null,
    guestName: input.guestName,
    shareLinkId: link.id,
    mentionedUserIds: [],
  });
  if (created) await publish(version.projectId, { type: "comment", action: "upserted", versionId: version.id, comment: dto });
  return dto;
}

type VersionForComment = { id: string; kind: "video" | "image"; durationMs: number | null };

// The probed duration and the player's can differ by a few ms (container vs
// stream length), and the last frame's middle may sit just past the former.
const END_SLACK_MS = 100;

// Where a new comment may sit: the thread it replies to, its timecode, range
// and drawing. Same rules for members and guests.
async function placeComment(version: VersionForComment, input: z.infer<typeof createCommentSchema>) {
  const db = getDb();
  if (input.parentId) {
    const [parent] = await db
      .select({ versionId: comments.versionId, parentId: comments.parentId })
      .from(comments)
      .where(eq(comments.id, input.parentId))
      .limit(1);
    if (!parent || parent.versionId !== version.id) throw new ApiError(404, "not_found", "Thread not found.");
    if (parent.parentId) throw new ApiError(400, "nested_reply", "Reply to the first comment of the thread.");
  }

  // Timecodes belong to top-level video comments and must be inside the video.
  const timecodeMs = input.parentId || version.kind !== "video" ? null : input.timecodeMs;
  if (timecodeMs !== null && version.durationMs !== null && timecodeMs > version.durationMs + END_SLACK_MS) {
    throw new ApiError(400, "validation_failed", "The timecode is past the end of the video.", {
      timecodeMs: "Past the end of the video.",
    });
  }
  // A range only makes sense with a start (the schema already checked end > start).
  const rangeEndMs = timecodeMs === null ? null : input.rangeEndMs;
  if (rangeEndMs !== null && version.durationMs !== null && rangeEndMs > version.durationMs + END_SLACK_MS) {
    throw new ApiError(400, "validation_failed", "The range ends past the end of the video.", {
      rangeEndMs: "Past the end of the video.",
    });
  }

  // A drawing belongs to a frame: only kept on comments that have a timecode.
  const annotation = timecodeMs === null ? null : input.annotation;
  return { timecodeMs, rangeEndMs, annotation };
}

async function insertComment(
  version: { id: string },
  input: z.infer<typeof createCommentSchema>,
  placement: Awaited<ReturnType<typeof placeComment>>,
  author: Pick<typeof comments.$inferInsert, "authorId" | "guestName" | "shareLinkId" | "mentionedUserIds">,
) {
  const inserted = await getDb()
    .insert(comments)
    .values({ id: input.id, versionId: version.id, parentId: input.parentId, body: input.body, ...placement, ...author })
    // A retried POST with the same client id is a no-op, not a duplicate.
    .onConflictDoNothing({ target: comments.id })
    .returning({ id: comments.id });

  const row = await findComment(input.id);
  if (!row || row.authorId !== (author.authorId ?? null) || row.versionId !== version.id) {
    throw new ApiError(409, "id_conflict", "Comment id already used.");
  }
  return { dto: toDto(row), created: inserted.length > 0 };
}

async function notifyMentions(
  author: CurrentUser,
  mentions: string[],
  members: { id: string; name: string; email: string }[],
  version: { assetId: string; assetName: string; number: number },
  comment: CommentDto,
) {
  const url = `${getEnv().APP_URL}/a/${version.assetId}?v=${version.number}#comment-${comment.id}`;
  const excerpt = comment.body.length > 300 ? `${comment.body.slice(0, 300)}…` : comment.body;
  for (const id of mentions) {
    const member = members.find((m) => m.id === id);
    if (!member || member.id === author.id) continue;
    await getEmailQueue()
      .add("mention", mentionEmail({ to: member.email, authorName: author.name, assetName: version.assetName, excerpt, url }))
      .catch((error) => logger.error({ err: error }, "failed to enqueue mention email"));
  }
}

// If-Match: "<revision>". Required, so a client can't overwrite a change it
// hasn't seen (two people editing or resolving the same comment at once).
function parseIfMatch(header: string | null): number {
  if (!header) throw new ApiError(428, "precondition_required", "If-Match header is required.");
  const revision = Number(header.replace(/^W\//, "").replaceAll('"', ""));
  if (!Number.isInteger(revision)) throw new ApiError(400, "invalid_if_match", "Invalid If-Match header.");
  return revision;
}

async function loadForWrite(user: CurrentUser, commentId: string) {
  if (!isUuid(commentId)) throw new ApiError(404, "not_found", "Comment not found.");
  const row = await findComment(commentId);
  if (!row) throw new ApiError(404, "not_found", "Comment not found.");
  const access = await getVersionAccess(user.id, row.versionId);
  return { row, ...access };
}

// 412 carries the current comment so the client can show what changed.
function conflict(current: CommentRow | undefined): never {
  throw new ApiError(412, "conflict", "Someone else changed this comment. Showing the latest version.", undefined, {
    current: current ? toDto(current) : null,
  });
}

export async function updateComment(
  user: CurrentUser,
  commentId: string,
  ifMatch: string | null,
  input: z.infer<typeof updateCommentSchema>,
): Promise<CommentDto> {
  const expected = parseIfMatch(ifMatch);
  const { row, version, role, workspaceId } = await loadForWrite(user, commentId);
  if (!can(role, "comment")) throw new ApiError(403, "forbidden", "Viewers can't change comments.");

  let changes: Partial<typeof comments.$inferInsert>;
  let members: { id: string; name: string; email: string }[] = [];
  let newMentions: string[] = [];

  if ("resolved" in input) {
    if (row.parentId) throw new ApiError(400, "not_a_thread", "Only threads can be resolved.");
    changes = { resolvedAt: input.resolved ? new Date() : null };
  } else {
    if (row.authorId !== user.id) throw new ApiError(403, "forbidden", "You can only edit your own comments.");
    members = (await listMembers(workspaceId)).map((m) => ({ id: m.userId, name: m.name, email: m.email }));
    const mentions = keepMentionsInBody(input.body, input.mentions, members);
    // Mention emails only go to people this edit newly mentions.
    newMentions = mentions.filter((id) => !row.mentions.includes(id));
    changes = { body: input.body, mentionedUserIds: mentions, editedAt: new Date() };
  }

  // Compare-and-set on revision: the update applies only to the revision the
  // client saw. Zero rows updated = someone else changed it first.
  const [updated] = await getDb()
    .update(comments)
    .set({ ...changes, revision: row.revision + 1 })
    .where(and(eq(comments.id, row.id), eq(comments.revision, expected)))
    .returning({ id: comments.id });
  if (!updated) conflict(await findComment(row.id));

  const dto = await withReplies(toDto((await findComment(row.id))!));
  await publish(version.projectId, { type: "comment", action: "upserted", versionId: version.id, comment: dto });
  await notifyMentions(user, newMentions, members, version, dto);
  return dto;
}

// Updated threads are sent with their replies, so receivers can replace them whole.
async function withReplies(dto: CommentDto): Promise<CommentDto> {
  if (dto.parentId) return dto;
  const replies = await getDb()
    .select(commentColumns)
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.parentId, dto.id))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  return { ...dto, replies: replies.map((r) => toDto(r)) };
}

export async function deleteComment(user: CurrentUser, commentId: string, ifMatch: string | null) {
  const expected = parseIfMatch(ifMatch);
  const { row, version } = await loadForWrite(user, commentId);
  if (row.authorId !== user.id) throw new ApiError(403, "forbidden", "You can only delete your own comments.");

  const [deleted] = await getDb()
    .delete(comments)
    .where(and(eq(comments.id, row.id), eq(comments.revision, expected)))
    .returning({ id: comments.id });
  if (!deleted) conflict(await findComment(row.id));

  await publish(version.projectId, {
    type: "comment",
    action: "deleted",
    versionId: version.id,
    commentId: row.id,
    parentId: row.parentId,
  });
}
