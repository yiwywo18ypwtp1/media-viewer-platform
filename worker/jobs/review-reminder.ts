import type { Job } from "bullmq";
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Transporter } from "nodemailer";
import type { Logger } from "pino";
import { reviewReminderEmail } from "../../src/server/emails";
import type { ReviewReminderJob } from "../../src/server/jobs";
import * as schema from "../../src/server/schema";

// Fires 24 h before a review is due (a delayed job scheduled at creation).
// The review may have finished or gone stale since: then there's nothing to do.
export function createReviewReminder(deps: {
  db: PostgresJsDatabase<typeof schema>;
  mailer: Transporter;
  from: string;
  appUrl: string;
  log: Logger;
}) {
  const { reviewRequests, reviewDecisions, assets, assetVersions, users } = schema;

  return async function reviewReminder(job: Job<ReviewReminderJob>) {
    const [request] = await deps.db
      .select({
        status: reviewRequests.status,
        steps: reviewRequests.steps,
        currentStep: reviewRequests.currentStep,
        dueAt: reviewRequests.dueAt,
        assetId: assets.id,
        assetName: assets.name,
        versionNumber: assetVersions.number,
      })
      .from(reviewRequests)
      .innerJoin(assets, eq(assets.id, reviewRequests.assetId))
      .innerJoin(assetVersions, eq(assetVersions.id, reviewRequests.versionId))
      .where(eq(reviewRequests.id, job.data.requestId));
    if (!request || request.status !== "active" || !request.dueAt) return;

    // Only those in the current step who haven't decided yet.
    const decided = await deps.db
      .select({ userId: reviewDecisions.userId })
      .from(reviewDecisions)
      .where(and(eq(reviewDecisions.requestId, job.data.requestId), eq(reviewDecisions.step, request.currentStep)));
    const pending = request.steps[request.currentStep].reviewers.filter((id) => !decided.some((d) => d.userId === id));
    if (pending.length === 0) return;

    const recipients = await deps.db.select({ email: users.email }).from(users).where(inArray(users.id, pending));
    const url = `${deps.appUrl}/a/${request.assetId}?v=${request.versionNumber}`;
    for (const { email } of recipients) {
      await deps.mailer.sendMail({
        from: deps.from,
        ...reviewReminderEmail({ to: email, assetName: request.assetName, dueAt: request.dueAt, url }),
      });
    }
    deps.log.info({ jobId: job.id, requestId: job.data.requestId, sent: recipients.length }, "review reminder sent");
  };
}
