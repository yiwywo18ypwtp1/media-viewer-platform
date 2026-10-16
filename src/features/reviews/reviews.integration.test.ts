import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getAssetAccess } from "@/features/assets/queries";
import { addMember, createAsset, createTeam, removeMember, type Team } from "@/test/integration";
import { getDb } from "@/server/db";
import { assets, reviewDecisions, reviewRequests } from "@/server/schema";
import { createReviewRequest, decide } from "./server";

let team: Team;
let asset: { assetId: string; versionId: string };
beforeEach(async () => {
  team = await createTeam();
  asset = await createAsset(team);
});

const assetStatus = async () =>
  (await getDb().select({ status: assets.status }).from(assets).where(eq(assets.id, asset.assetId)))[0].status;

describe("review decisions in a transaction", () => {
  it("records exactly one decision when two 'any' reviewers click at the same time", async () => {
    const second = await addMember(team, "reviewer", "Second");
    const { id } = await createReviewRequest(team.editor, {
      ...asset,
      dueAt: null,
      message: null,
      steps: [{ reviewers: [team.reviewer.id, second.id], rule: "any" }],
    });

    const results = await Promise.allSettled([
      decide(team.reviewer, id, randomUUID(), { decision: "approve" }),
      decide(second, id, randomUUID(), { decision: "request_changes" }),
    ]);

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: "review_closed" });

    const decisions = await getDb().select().from(reviewDecisions).where(eq(reviewDecisions.requestId, id));
    expect(decisions).toHaveLength(1);
    // The request and the asset agree with the decision that won.
    const final = decisions[0].decision === "approve" ? "approved" : "changes_requested";
    const [request] = await getDb().select().from(reviewRequests).where(eq(reviewRequests.id, id));
    expect(request.status).toBe(final);
    expect(await assetStatus()).toBe(final);
  });

  it("moves from an 'any' step to an 'all' step and approves when everyone has", async () => {
    const { id } = await createReviewRequest(team.editor, {
      ...asset,
      dueAt: null,
      message: null,
      steps: [
        { reviewers: [team.reviewer.id], rule: "any" },
        { reviewers: [team.editor.id, team.owner.id], rule: "all" },
      ],
    });

    // Step 2 people can't jump ahead.
    await expect(decide(team.owner, id, randomUUID(), { decision: "approve" })).rejects.toMatchObject({ code: "not_reviewer" });

    await expect(decide(team.reviewer, id, randomUUID(), { decision: "approve" })).resolves.toMatchObject({
      status: "active",
      currentStep: 1,
    });
    await expect(decide(team.editor, id, randomUUID(), { decision: "approve" })).resolves.toMatchObject({
      status: "active",
      currentStep: 1,
    });
    expect(await assetStatus()).toBe("in_review");
    await expect(decide(team.owner, id, randomUUID(), { decision: "approve" })).resolves.toMatchObject({ status: "approved" });
    expect(await assetStatus()).toBe("approved");
  });

  it("treats a retry with the same Idempotency-Key as the same decision", async () => {
    const { id } = await createReviewRequest(team.editor, {
      ...asset,
      dueAt: null,
      message: null,
      steps: [{ reviewers: [team.reviewer.id, team.owner.id], rule: "all" }],
    });
    const key = randomUUID();
    const first = await decide(team.reviewer, id, key, { decision: "approve" });
    const retry = await decide(team.reviewer, id, key, { decision: "approve" });
    expect(retry).toEqual(first);
    const decisions = await getDb().select().from(reviewDecisions).where(eq(reviewDecisions.requestId, id));
    expect(decisions).toHaveLength(1);
  });

  it("allows only one active review per asset, even when requested twice at once", async () => {
    const request = () =>
      createReviewRequest(team.editor, {
        ...asset,
        dueAt: null,
        message: null,
        steps: [{ reviewers: [team.reviewer.id], rule: "any" }],
      });
    const results = await Promise.allSettled([request(), request()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409, code: "already_active" } });
  });
});

describe("access after removal", () => {
  it("a removed reviewer can no longer reach the asset (and so gets no media URLs)", async () => {
    expect(await getAssetAccess(team.reviewer.id, asset.assetId)).toBeTruthy();
    await removeMember(team, team.reviewer);
    expect(await getAssetAccess(team.reviewer.id, asset.assetId)).toBeNull();
  });
});
