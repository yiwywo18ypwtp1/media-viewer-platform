// Keyset pagination cursor: the (createdAt, id) of the last comment on a page.
// The next page is "rows after that pair" in (created_at, id) order. Unlike
// OFFSET, comments added or deleted meanwhile don't shift pages (no duplicates,
// no skips), and the index serves it directly.

export type Cursor = { createdAt: Date; id: string };

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}|${cursor.id}`).toString("base64url");
}

export function decodeCursor(value: string): Cursor | null {
  const [iso, id] = Buffer.from(value, "base64url").toString().split("|");
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}
