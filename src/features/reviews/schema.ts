import { z } from "zod";

// Shared by the review request wizard (zodResolver) and the API routes.

// Sequential approval steps. The cap only keeps the wizard and the emails
// sane; rules and the decision transaction work for any number.
export const MAX_STEPS = 5;

export const ruleSchema = z.union([
  z.literal("all"),
  z.literal("any"),
  z.object({ atLeast: z.number().int().min(1, "Needs at least 1 approval.") }),
]);

const stepSchema = z.object({
  reviewers: z.array(z.uuid()).min(1, "Pick at least one reviewer."),
  rule: ruleSchema,
});

export const stepsSchema = z
  .array(stepSchema)
  .min(1)
  .max(MAX_STEPS)
  .superRefine((steps, ctx) => {
    const stepOf = new Map<string, number>();
    steps.forEach((step, index) => {
      if (typeof step.rule === "object" && step.rule.atLeast > step.reviewers.length) {
        ctx.addIssue({
          code: "custom",
          path: [index, "rule"],
          message: `Can't need more approvals than reviewers (${step.reviewers.length}).`,
        });
      }
      for (const reviewer of step.reviewers) {
        if (stepOf.has(reviewer)) {
          ctx.addIssue({ code: "custom", path: [index, "reviewers"], message: "A reviewer can only be in one step." });
        }
        stepOf.set(reviewer, index);
      }
    });
  });

export const createReviewRequestSchema = z.object({
  assetId: z.uuid(),
  versionId: z.uuid(),
  // An instant (ISO with offset). The form turns the creator's local time
  // into one, so "in the future" is judged in their time zone.
  dueAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .refine((value) => value === null || new Date(value).getTime() > Date.now(), "Pick a time in the future."),
  message: z.string().trim().max(2000).nullable(),
  steps: stepsSchema,
});

export const decisionSchema = z.object({
  decision: z.enum(["approve", "request_changes"]),
  note: z.string().trim().max(2000).optional(),
});
