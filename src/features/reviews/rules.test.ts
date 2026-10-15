import { describe, expect, it } from "vitest";
import { applyDecision, evaluateStep, type RequestState, type Step } from "./rules";

const approve = (userId: string) => ({ userId, decision: "approve" as const });
const reject = (userId: string) => ({ userId, decision: "request_changes" as const });

describe("evaluateStep: all", () => {
  const step: Step = { reviewers: ["a", "b", "c"], rule: "all" };

  it("is pending until everyone approved", () => {
    expect(evaluateStep(step, [approve("a"), approve("b")])).toBe("pending");
  });
  it("is approved when everyone approved", () => {
    expect(evaluateStep(step, [approve("a"), approve("b"), approve("c")])).toBe("approved");
  });
  it("one request for changes settles it", () => {
    expect(evaluateStep(step, [approve("a"), reject("b")])).toBe("changes_requested");
  });
});

describe("evaluateStep: any", () => {
  const step: Step = { reviewers: ["a", "b"], rule: "any" };

  it("is pending with no decisions", () => {
    expect(evaluateStep(step, [])).toBe("pending");
  });
  it("the first decision settles it (approve)", () => {
    expect(evaluateStep(step, [approve("b"), reject("a")])).toBe("approved");
  });
  it("the first decision settles it (changes)", () => {
    expect(evaluateStep(step, [reject("a"), approve("b")])).toBe("changes_requested");
  });
});

describe("evaluateStep: atLeast", () => {
  const step: Step = { reviewers: ["a", "b", "c", "d"], rule: { atLeast: 2 } };

  it("is approved at N approvals, even with a rejection", () => {
    expect(evaluateStep(step, [reject("a"), approve("b"), approve("c")])).toBe("approved");
  });
  it("stays pending while N approvals are still possible", () => {
    expect(evaluateStep(step, [reject("a"), reject("b")])).toBe("pending");
  });
  it("fails as soon as N approvals can no longer be reached", () => {
    expect(evaluateStep(step, [reject("a"), reject("b"), reject("c")])).toBe("changes_requested");
  });
  it("atLeast equal to the reviewer count behaves like all", () => {
    const strict: Step = { reviewers: ["a", "b"], rule: { atLeast: 2 } };
    expect(evaluateStep(strict, [approve("a")])).toBe("pending");
    expect(evaluateStep(strict, [approve("a"), reject("b")])).toBe("changes_requested");
  });
});

describe("evaluateStep: robustness", () => {
  it("ignores people who aren't reviewers of the step", () => {
    expect(evaluateStep({ reviewers: ["a"], rule: "any" }, [approve("x"), reject("a")])).toBe("changes_requested");
  });
  it("counts each reviewer once", () => {
    expect(evaluateStep({ reviewers: ["a", "b"], rule: "all" }, [approve("a"), approve("a")])).toBe("pending");
  });
});

function request(steps: Step[]): RequestState {
  return { status: "active", currentStep: 0, steps, decisions: [] };
}

describe("applyDecision", () => {
  it("two-step flow: any, then all -> approved", () => {
    let state = request([
      { reviewers: ["a", "b"], rule: "any" },
      { reviewers: ["c", "d"], rule: "all" },
    ]);
    const step = (userId: string, decision: "approve" | "request_changes") => {
      const result = applyDecision(state, { userId, decision });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    };

    step("b", "approve");
    expect(state).toMatchObject({ status: "active", currentStep: 1 });
    step("c", "approve");
    expect(state).toMatchObject({ status: "active", currentStep: 1 });
    step("d", "approve");
    expect(state).toMatchObject({ status: "approved", currentStep: 1 });
  });

  it("changes requested closes the whole request", () => {
    const result = applyDecision(request([{ reviewers: ["a", "b"], rule: "all" }]), {
      userId: "a",
      decision: "request_changes",
    });
    expect(result).toMatchObject({ ok: true, state: { status: "changes_requested" } });
  });

  it("concurrent decisions on an 'any' step: the first wins, the second is rejected", () => {
    // What the row lock turns two simultaneous clicks into: one after the other.
    const initial = request([{ reviewers: ["a", "b"], rule: "any" }]);
    const first = applyDecision(initial, { userId: "a", decision: "approve" });
    expect(first).toMatchObject({ ok: true, state: { status: "approved" } });
    const second = applyDecision(first.ok ? first.state : initial, { userId: "b", decision: "request_changes" });
    expect(second).toEqual({ ok: false, error: "closed" });
  });

  it("rejects non-reviewers and double decisions", () => {
    const state = request([{ reviewers: ["a", "b"], rule: "all" }]);
    expect(applyDecision(state, { userId: "z", decision: "approve" })).toEqual({ ok: false, error: "not_reviewer" });
    const once = applyDecision(state, { userId: "a", decision: "approve" });
    if (!once.ok) throw new Error("expected ok");
    expect(applyDecision(once.state, { userId: "a", decision: "approve" })).toEqual({
      ok: false,
      error: "already_decided",
    });
  });

  it("reviewers of a later step can't decide early", () => {
    const state = request([
      { reviewers: ["a"], rule: "all" },
      { reviewers: ["b"], rule: "all" },
    ]);
    expect(applyDecision(state, { userId: "b", decision: "approve" })).toEqual({ ok: false, error: "not_reviewer" });
  });

  it("stale or finished requests take no decisions", () => {
    const stale = { ...request([{ reviewers: ["a"], rule: "all" as const }]), status: "stale" as const };
    expect(applyDecision(stale, { userId: "a", decision: "approve" })).toEqual({ ok: false, error: "closed" });
  });
});
