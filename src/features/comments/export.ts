import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { CurrentUser } from "@/features/auth/session";
import { formatTimecode, frameRate } from "@/features/player/timecode";
import { toCsv } from "@/lib/csv";
import { getDb } from "@/server/db";
import { comments, users } from "@/server/schema";
import { getVersionAccess } from "./server";

// All comments of a version as CSV: threads in the order they were started,
// each followed by its replies. Timecodes as the player shows them, at the
// version's own frame rate. Anyone who can see the version can export it.
export async function exportCommentsCsv(user: CurrentUser, versionId: string) {
  const { version } = await getVersionAccess(user.id, versionId);
  const rate = frameRate(version.fps ?? 25);
  const timecode = (ms: number | null) => (ms === null ? null : formatTimecode(ms / 1000, rate));

  const rows = await getDb()
    .select({
      id: comments.id,
      parentId: comments.parentId,
      author: sql<string>`coalesce(${users.name}, ${comments.guestName})`,
      isGuest: sql<boolean>`${comments.authorId} is null`,
      body: comments.body,
      timecodeMs: comments.timecodeMs,
      rangeEndMs: comments.rangeEndMs,
      hasDrawing: sql<boolean>`${comments.annotation} is not null`,
      resolvedAt: comments.resolvedAt,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.versionId, version.id))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  const threads = rows.filter((row) => row.parentId === null);
  const lines: (string | number | null)[][] = [
    ["Thread", "Type", "Author", "Timecode", "Range end", "Comment", "Status", "Drawing", "Created (UTC)"],
  ];
  threads.forEach((thread, index) => {
    for (const row of [thread, ...rows.filter((r) => r.parentId === thread.id)]) {
      const isReply = row !== thread;
      lines.push([
        index + 1,
        isReply ? "reply" : "comment",
        row.isGuest ? `${row.author} (guest)` : row.author,
        timecode(row.timecodeMs),
        timecode(row.rangeEndMs),
        row.body,
        isReply ? null : thread.resolvedAt ? "resolved" : "open",
        row.hasDrawing ? "yes" : null,
        row.createdAt.toISOString(),
      ]);
    }
  });

  const safeName = version.assetName.replace(/[^\w.\- ]+/g, "_");
  return { csv: toCsv(lines), fileName: `${safeName}_v${version.number}_comments.csv` };
}
