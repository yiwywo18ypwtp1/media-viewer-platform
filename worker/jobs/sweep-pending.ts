import type { Queue } from "bullmq";
import { and, eq, lt } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Logger } from "pino";
import { MEDIA_JOB_OPTIONS, type MediaJob } from "../../src/server/jobs";
import * as schema from "../../src/server/schema";

// Safety net for "never stuck in pending": if web saved a version but couldn't
// enqueue its job (Redis was down at that moment), this re-enqueues it.
// jobId = versionId, so versions that do have a job (waiting, delayed for a
// retry, active) are ignored by BullMQ: no duplicates.
const PENDING_GRACE_MS = 2 * 60 * 1000;

export function createSweepPending(deps: {
  db: PostgresJsDatabase<typeof schema>;
  mediaQueue: Queue<MediaJob>;
  log: Logger;
}) {
  return async function sweepPending() {
    const { assetVersions } = schema;
    const stuck = await deps.db
      .select({ id: assetVersions.id })
      .from(assetVersions)
      .where(
        and(
          eq(assetVersions.processingState, "pending"),
          lt(assetVersions.createdAt, new Date(Date.now() - PENDING_GRACE_MS)),
        ),
      )
      .limit(100);

    for (const { id } of stuck) {
      await deps.mediaQueue.add("process", { versionId: id }, { ...MEDIA_JOB_OPTIONS, jobId: id });
    }
    if (stuck.length > 0) deps.log.info({ checked: stuck.length }, "pending versions re-enqueued (if missing)");
  };
}
