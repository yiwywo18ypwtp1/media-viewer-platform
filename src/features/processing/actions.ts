"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/features/auth/session";
import { getProjectAccess } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";
import { isUuid } from "@/lib/ids";
import { getDb } from "@/server/db";
import { getMediaQueue } from "@/server/queues";
import { assets, assetVersions } from "@/server/schema";

// "Retry" on a version whose processing failed for good.
export async function retryProcessing(versionId: unknown) {
  const user = await requireUser();
  if (!isUuid(versionId)) throw new Error("Version not found.");

  const [version] = await getDb()
    .select({ projectId: assets.projectId, state: assetVersions.processingState })
    .from(assetVersions)
    .innerJoin(assets, eq(assets.id, assetVersions.assetId))
    .where(eq(assetVersions.id, versionId))
    .limit(1);
  const access = version && (await getProjectAccess(user.id, version.projectId));
  if (!access || !can(access.role, "upload")) throw new Error("You don't have access to do that.");
  if (version.state !== "failed") return;

  await getDb()
    .update(assetVersions)
    .set({ processingState: "pending", processingProgress: 0, processingError: null, processingAttempts: 0 })
    .where(eq(assetVersions.id, versionId));

  // The failed job still exists under jobId = versionId, and BullMQ would
  // ignore a new job with the same id. Remove it first, then add a fresh one
  // with a full set of attempts.
  const queue = getMediaQueue();
  await (await queue.getJob(versionId))?.remove();
  await queue.add("process", { versionId }, { jobId: versionId });

  revalidatePath(`/p/${version.projectId}`);
}
