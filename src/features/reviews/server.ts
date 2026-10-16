import "server-only";
import { and, asc, desc, eq, inArray, notExists, sql } from "drizzle-orm";
import type { z } from "zod";
import { getAssetAccess } from "@/features/assets/queries";
import type { CurrentUser } from "@/features/auth/session";
import { listMembers } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";
import { isUuid } from "@/lib/ids";
import { ApiError } from "@/server/api";
import { getDb } from "@/server/db";
import { reviewDecisionEmail, reviewRequestedEmail } from "@/server/emails";
import { getEnv } from "@/server/env";
import type { ReviewReminderJob } from "@/server/jobs";
import { logger } from "@/server/logger";
import { getEmailQueue, getMaintenanceQueue } from "@/server/queues";
import { projectChannel, type ReviewEvent } from "@/server/realtime";
import { getRedis } from "@/server/redis";
import {
  assets,
  assetVersions,
  projects,
  reviewDecisions,
  reviewRequests,
  users,
  workspaceMembers,
} from "@/server/schema";
import { applyDecision, type DecisionError, type Rule } from "./rules";
import type { createReviewRequestSchema, decisionSchema } from "./schema";

const REMINDER_BEFORE_DUE_MS = 24 * 60 * 60 * 1000;

const assetUrl = (assetId: string, versionNumber: number) => `${getEnv().APP_URL}/a/${assetId}?v=${versionNumber}`;

async function emailsOf(userIds: string[]) {
  if (userIds.length === 0) return [];
  return getDb().select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, userIds));
}

async function publish(projectId: string, assetId: string) {
  const event: ReviewEvent = { type: "review", assetId };
  await getRedis()
    .publish(projectChannel(projectId), JSON.stringify(event))
    .catch((error) => logger.warn({ err: error }, "failed to publish review event"));
}

// Emails and realtime events go out after the transaction commits: a rolled-back
// request must not have notified anyone. Failures are logged, not fatal.
async function enqueueEmails(jobs: Parameters<ReturnType<typeof getEmailQueue>["add"]>[1][]) {
  for (const job of jobs) {
    await getEmailQueue()
      .add("review", job)
      .catch((error) => logger.error({ err: error }, "failed to enqueue review email"));
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  // postgres.js error, possibly wrapped by Drizzle as `cause`.
  const pgError = (error as { cause?: unknown })?.cause ?? error;
  const { code, constraint_name } = pgError as { code?: string; constraint_name?: string };
  return code === "23505" && constraint_name === constraint;
}

// --- Create ---

export async function createReviewRequest(user: CurrentUser, input: z.infer<typeof createReviewRequestSchema>) {
  const access = await getAssetAccess(user.id, input.assetId);
  if (!access) throw new ApiError(404, "not_found", "Asset not found.");
  if (!can(access.role, "requestReview")) throw new ApiError(403, "forbidden", "You can't request reviews here.");
  const db = getDb();

  const [version] = await db
    .select({ number: assetVersions.number })
    .from(assetVersions)
    .where(and(eq(assetVersions.id, input.versionId), eq(assetVersions.assetId, access.asset.id)))
    .limit(1);
  if (!version) throw new ApiError(400, "validation_failed", "Pick a version of this asset.", { versionId: "Unknown version." });

  // Reviewers must be members who can decide (reviewer, editor or owner).
  const members = await listMembers(access.workspace.id);
  input.steps.forEach((step, index) => {
    const invalid = step.reviewers.some((id) => {
      const member = members.find((m) => m.userId === id);
      return !member || !can(member.role, "decideReview");
    });
    if (invalid) {
      throw new ApiError(400, "validation_failed", "Some reviewers can't review in this workspace.", {
        [`steps.${index}.reviewers`]: "Only reviewers, editors and owners of this workspace can review.",
      });
    }
  });

  const request = await db
    .transaction(async (tx) => {
      const [created] = await tx
        .insert(reviewRequests)
        .values({
          assetId: access.asset.id,
          versionId: input.versionId,
          createdBy: user.id,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          message: input.message || null,
          steps: input.steps,
        })
        .returning();
      // A new review puts the asset back in review.
      await tx.update(assets).set({ status: "in_review" }).where(eq(assets.id, access.asset.id));
      return created;
    })
    .catch((error) => {
      if (isUniqueViolation(error, "review_requests_one_active_per_asset")) {
        throw new ApiError(409, "already_active", "This asset already has an active review.");
      }
      throw error;
    });

  const url = assetUrl(access.asset.id, version.number);
  const recipients = await emailsOf(input.steps[0].reviewers.filter((id) => id !== user.id));
  await enqueueEmails(
    recipients.map((r) =>
      reviewRequestedEmail({
        to: r.email,
        requesterName: user.name,
        assetName: access.asset.name,
        versionNumber: version.number,
        dueAt: request.dueAt,
        message: request.message,
        url,
      }),
    ),
  );

  // Reminder 24 h before the due date: a delayed job, no polling. jobId makes
  // it unique per request; the job checks the request is still open when it fires.
  if (request.dueAt) {
    const delay = request.dueAt.getTime() - REMINDER_BEFORE_DUE_MS - Date.now();
    if (delay > 0) {
      await getMaintenanceQueue()
        .add("review-reminder", { requestId: request.id } satisfies ReviewReminderJob, {
          delay,
          jobId: `review-reminder-${request.id}`,
        })
        .catch((error) => logger.error({ err: error }, "failed to schedule review reminder"));
    }
  }

  await publish(access.project.id, access.asset.id);
  return { id: request.id };
}

// --- Decide ---

const DECISION_ERRORS: Record<DecisionError, ApiError> = {
  closed: new ApiError(409, "review_closed", "This review step was already settled."),
  not_reviewer: new ApiError(403, "not_reviewer", "You're not a reviewer of the current step."),
  already_decided: new ApiError(409, "already_decided", "You already decided on this step."),
};

export async function decide(
  user: CurrentUser,
  requestId: string,
  idempotencyKey: string | null,
  input: z.infer<typeof decisionSchema>,
) {
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new ApiError(400, "idempotency_key_required", "An Idempotency-Key header is required.");
  }
  if (!isUuid(requestId)) throw new ApiError(404, "not_found", "Review not found.");
  const db = getDb();

  const [target] = await db
    .select({ assetId: reviewRequests.assetId })
    .from(reviewRequests)
    .where(eq(reviewRequests.id, requestId))
    .limit(1);
  const access = target && (await getAssetAccess(user.id, target.assetId));
  if (!access) throw new ApiError(404, "not_found", "Review not found.");
  if (!can(access.role, "decideReview")) throw new ApiError(403, "forbidden", "Viewers can't decide on reviews.");

  const result = await db.transaction(async (tx) => {
    // Row lock: concurrent decisions on this request run one after another,
    // each seeing the previous one's result.
    const [request] = await tx.select().from(reviewRequests).where(eq(reviewRequests.id, requestId)).for("update");

    // A retry of a request we already handled: same answer, nothing recorded twice.
    const [previous] = await tx
      .select({ id: reviewDecisions.id })
      .from(reviewDecisions)
      .where(
        and(
          eq(reviewDecisions.requestId, requestId),
          eq(reviewDecisions.userId, user.id),
          eq(reviewDecisions.idempotencyKey, idempotencyKey),
        ),
      );
    if (previous) return { request, replayed: true, advanced: false };

    const decisions = await tx
      .select({ userId: reviewDecisions.userId, step: reviewDecisions.step, decision: reviewDecisions.decision })
      .from(reviewDecisions)
      .where(eq(reviewDecisions.requestId, requestId))
      .orderBy(asc(reviewDecisions.createdAt));

    const applied = applyDecision(
      { status: request.status, currentStep: request.currentStep, steps: request.steps, decisions },
      { userId: user.id, decision: input.decision },
    );
    if (!applied.ok) throw DECISION_ERRORS[applied.error];

    await tx.insert(reviewDecisions).values({
      requestId,
      userId: user.id,
      step: request.currentStep,
      decision: input.decision,
      note: input.note || null,
      idempotencyKey,
    });

    const finished = applied.state.status !== "active";
    const [updated] = await tx
      .update(reviewRequests)
      .set({
        status: applied.state.status,
        currentStep: applied.state.currentStep,
        completedAt: finished ? new Date() : null,
      })
      .where(eq(reviewRequests.id, requestId))
      .returning();
    // The final status is computed here, in the same transaction, and copied
    // onto the asset (approved / changes requested).
    if (applied.state.status === "approved" || applied.state.status === "changes_requested") {
      await tx.update(assets).set({ status: applied.state.status }).where(eq(assets.id, request.assetId));
    }
    return { request: updated, replayed: false, advanced: updated.currentStep !== request.currentStep };
  });

  if (!result.replayed) {
    const [version] = await db
      .select({ number: assetVersions.number })
      .from(assetVersions)
      .where(eq(assetVersions.id, result.request.versionId));
    const url = assetUrl(access.asset.id, version.number);
    const [requester] = await emailsOf([result.request.createdBy]);
    const jobs = [];
    if (requester && requester.id !== user.id) {
      jobs.push(
        reviewDecisionEmail({
          to: requester.email,
          reviewerName: user.name,
          assetName: access.asset.name,
          decision: input.decision,
          note: input.note || null,
          outcome: result.request.status,
          url,
        }),
      );
    }
    if (result.advanced) {
      // As on create: the requester isn't asked to review by themselves.
      const nextReviewers = await emailsOf(
        result.request.steps[result.request.currentStep].reviewers.filter((id) => id !== result.request.createdBy),
      );
      const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, result.request.createdBy));
      jobs.push(
        ...nextReviewers.map((r) =>
          reviewRequestedEmail({
            to: r.email,
            requesterName: creator.name,
            assetName: access.asset.name,
            versionNumber: version.number,
            dueAt: result.request.dueAt,
            message: result.request.message,
            url,
          }),
        ),
      );
    }
    await enqueueEmails(jobs);
    await publish(access.project.id, access.asset.id);
  }

  return { id: result.request.id, status: result.request.status, currentStep: result.request.currentStep };
}

// --- Read ---

export type ReviewSummary = NonNullable<Awaited<ReturnType<typeof getLatestReview>>>;

// The newest review of an asset (active, finished or stale), with who decided what.
export async function getLatestReview(assetId: string) {
  const db = getDb();
  const [request] = await db
    .select({
      id: reviewRequests.id,
      versionId: reviewRequests.versionId,
      versionNumber: assetVersions.number,
      status: reviewRequests.status,
      currentStep: reviewRequests.currentStep,
      dueAt: reviewRequests.dueAt,
      message: reviewRequests.message,
      steps: reviewRequests.steps,
      createdAt: reviewRequests.createdAt,
      createdBy: users.name,
    })
    .from(reviewRequests)
    .innerJoin(assetVersions, eq(assetVersions.id, reviewRequests.versionId))
    .innerJoin(users, eq(users.id, reviewRequests.createdBy))
    .where(eq(reviewRequests.assetId, assetId))
    .orderBy(desc(reviewRequests.createdAt))
    .limit(1);
  if (!request) return null;

  const decisions = await db
    .select({
      userId: reviewDecisions.userId,
      step: reviewDecisions.step,
      decision: reviewDecisions.decision,
      note: reviewDecisions.note,
    })
    .from(reviewDecisions)
    .where(eq(reviewDecisions.requestId, request.id));
  const reviewerIds = [...new Set(request.steps.flatMap((step) => step.reviewers))];
  const names = reviewerIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, reviewerIds))
    : [];

  return {
    ...request,
    steps: request.steps.map((step: { reviewers: string[]; rule: Rule }, index: number) => ({
      rule: step.rule,
      reviewers: step.reviewers.map((id) => {
        const decision = decisions.find((d) => d.step === index && d.userId === id);
        return {
          id,
          name: names.find((n) => n.id === id)?.name ?? "Former member",
          decision: decision?.decision ?? null,
          note: decision?.note ?? null,
        };
      }),
    })),
  };
}

// Reviews waiting for this user: active, they're in the current step, they
// haven't decided yet, and they're still a member of the workspace.
export async function listInbox(userId: string) {
  const db = getDb();
  return db
    .select({
      id: reviewRequests.id,
      assetId: assets.id,
      assetName: assets.name,
      versionNumber: assetVersions.number,
      projectName: projects.name,
      dueAt: reviewRequests.dueAt,
      message: reviewRequests.message,
      requestedBy: users.name,
      createdAt: reviewRequests.createdAt,
    })
    .from(reviewRequests)
    .innerJoin(assets, eq(assets.id, reviewRequests.assetId))
    .innerJoin(assetVersions, eq(assetVersions.id, reviewRequests.versionId))
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .innerJoin(users, eq(users.id, reviewRequests.createdBy))
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, projects.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .where(
      and(
        eq(reviewRequests.status, "active"),
        // jsonb: steps[current_step].reviewers contains the user id
        sql`${reviewRequests.steps} -> ${reviewRequests.currentStep} -> 'reviewers' ? ${userId}`,
        notExists(
          db
            .select({ one: sql`1` })
            .from(reviewDecisions)
            .where(
              and(
                eq(reviewDecisions.requestId, reviewRequests.id),
                eq(reviewDecisions.userId, userId),
                eq(reviewDecisions.step, reviewRequests.currentStep),
              ),
            ),
        ),
      ),
    )
    .orderBy(sql`${reviewRequests.dueAt} asc nulls last`, asc(reviewRequests.createdAt));
}
