import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { transcriptSegments } from "@/server/schema";
import { prefixQuery } from "./search-query";

export type TranscriptLine = { startMs: number; endMs: number; text: string };

const LIMIT = 200;

// A version's transcript lines, all of them or those matching `query`, in
// time order. The caller has checked access to the version.
export async function searchTranscript(versionId: string, query: string): Promise<TranscriptLine[]> {
  const tsquery = prefixQuery(query);
  return getDb()
    .select({ startMs: transcriptSegments.startMs, endMs: transcriptSegments.endMs, text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.versionId, versionId),
        tsquery ? sql`${transcriptSegments.search} @@ to_tsquery('simple', ${tsquery})` : undefined,
      ),
    )
    .orderBy(asc(transcriptSegments.startMs))
    .limit(LIMIT);
}
