// Approval rules as pure functions: no database, no clock. The server runs
// applyDecision inside a transaction that holds a row lock on the request, so
// concurrent decisions reach it one at a time, in order.

export type Rule = "all" | "any" | { atLeast: number };
export type Step = { reviewers: string[]; rule: Rule };
export type DecisionValue = "approve" | "request_changes";
export type Decision = { userId: string; step: number; decision: DecisionValue };

export type RequestStatus = "active" | "approved" | "changes_requested" | "stale";
export type RequestState = {
  status: RequestStatus;
  currentStep: number;
  steps: Step[];
  decisions: Decision[];
};

export type StepOutcome = "pending" | "approved" | "changes_requested";

// Outcome of one step from its decisions (in the order they were made).
//   any:       the first decision settles the step, whichever way it goes.
//   all:       approved once every reviewer approved; one "request changes"
//              settles it as changes requested.
//   atLeast N: approved at N approvals; changes requested as soon as N
//              approvals can no longer be reached.
export function evaluateStep(step: Step, decisions: Pick<Decision, "userId" | "decision">[]): StepOutcome {
  // Only the step's reviewers count, once each.
  const counted = decisions.filter(
    (d, index) => step.reviewers.includes(d.userId) && decisions.findIndex((e) => e.userId === d.userId) === index,
  );
  const approvals = counted.filter((d) => d.decision === "approve").length;
  const rejections = counted.length - approvals;

  if (step.rule === "any") {
    if (counted.length === 0) return "pending";
    return counted[0].decision === "approve" ? "approved" : "changes_requested";
  }

  const needed = step.rule === "all" ? step.reviewers.length : step.rule.atLeast;
  if (approvals >= needed) return "approved";
  if (step.reviewers.length - rejections < needed) return "changes_requested";
  return "pending";
}

export type DecisionError = "closed" | "not_reviewer" | "already_decided";

// Records a decision and moves the request on: next step, approved, or
// changes requested. Returns an error instead of a state when the decision
// isn't allowed (e.g. the step was settled by someone a moment earlier).
export function applyDecision(
  state: RequestState,
  input: { userId: string; decision: DecisionValue },
): { ok: true; state: RequestState } | { ok: false; error: DecisionError } {
  if (state.status !== "active") return { ok: false, error: "closed" };
  const step = state.steps[state.currentStep];
  if (!step.reviewers.includes(input.userId)) return { ok: false, error: "not_reviewer" };
  if (state.decisions.some((d) => d.step === state.currentStep && d.userId === input.userId)) {
    return { ok: false, error: "already_decided" };
  }

  const decisions = [...state.decisions, { ...input, step: state.currentStep }];
  const outcome = evaluateStep(
    step,
    decisions.filter((d) => d.step === state.currentStep),
  );

  let status: RequestStatus = state.status;
  let currentStep = state.currentStep;
  if (outcome === "changes_requested") status = "changes_requested";
  else if (outcome === "approved") {
    if (currentStep === state.steps.length - 1) status = "approved";
    else currentStep += 1; // sequential steps: the next one opens
  }
  return { ok: true, state: { ...state, status, currentStep, decisions } };
}

export function describeRule(rule: Rule): string {
  if (rule === "all") return "all must approve";
  if (rule === "any") return "any one decides";
  return `at least ${rule.atLeast} must approve`;
}
