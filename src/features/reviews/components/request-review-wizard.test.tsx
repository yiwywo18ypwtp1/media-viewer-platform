import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestReviewWizard } from "./request-review-wizard";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const ASSET = "00000000-0000-4000-8000-000000000001";
const VERSION = "00000000-0000-4000-8000-000000000002";
const ANNA = "00000000-0000-4000-8000-0000000000a1";
const BORIS = "00000000-0000-4000-8000-0000000000b2";
const CLARA = "00000000-0000-4000-8000-0000000000c3";

function renderWizard() {
  const onClose = vi.fn();
  render(
    <RequestReviewWizard
      assetId={ASSET}
      versions={[{ id: VERSION, number: 1 }]}
      defaultVersionId={VERSION}
      reviewers={[
        { id: ANNA, name: "Anna" },
        { id: BORIS, name: "Boris" },
        { id: CLARA, name: "Clara" },
      ]}
      onClose={onClose}
    />,
  );
  return { user: userEvent.setup(), onClose };
}

// Each step is a <fieldset> named by its legend.
const step = (name: string) => screen.getByRole("group", { name });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "r1" }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("RequestReviewWizard", () => {
  it("sends two sequential steps with the rules picked for each", async () => {
    const { user, onClose } = renderWizard();
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Step 1: Anna alone, "any".
    await user.click(within(step("Approval")).getByRole("checkbox", { name: "Anna" }));
    await user.click(within(step("Approval")).getByRole("radio", { name: /any one reviewer/i }));

    // Step 2: Boris and Clara, switched from "all" to "at least 2".
    await user.click(screen.getByRole("button", { name: "Add step" }));
    const second = step("Step 2");
    await user.click(within(second).getByRole("checkbox", { name: "Boris" }));
    await user.click(within(second).getByRole("checkbox", { name: "Clara" }));
    await user.click(within(second).getByRole("radio", { name: /at least/i }));
    const approvals = within(second).getByRole("spinbutton", { name: "Required approvals" });
    await user.clear(approvals);
    await user.type(approvals, "2");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Anna · any one decides")).toBeInTheDocument();
    expect(screen.getByText("Boris, Clara · at least 2 must approve")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Request review" }));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/review-requests");
    expect(JSON.parse(init.body)).toEqual({
      assetId: ASSET,
      versionId: VERSION,
      dueAt: null,
      message: null,
      steps: [
        { reviewers: [ANNA], rule: "any" },
        { reviewers: [BORIS, CLARA], rule: { atLeast: 2 } },
      ],
    });
    expect(onClose).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("won't go on while 'at least' asks for more approvals than there are reviewers", async () => {
    const { user } = renderWizard();
    await user.click(screen.getByRole("button", { name: "Next" }));
    const approval = step("Approval");
    await user.click(within(approval).getByRole("checkbox", { name: "Anna" }));
    await user.click(within(approval).getByRole("radio", { name: /at least/i }));
    const approvals = within(approval).getByRole("spinbutton", { name: "Required approvals" });
    await user.clear(approvals);
    await user.type(approvals, "2");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await within(approval).findByText("Can't need more approvals than reviewers (1).")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request review" })).not.toBeInTheDocument();

    // Switching the rule back to "all" clears the problem.
    await user.click(within(approval).getByRole("radio", { name: /all reviewers/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("button", { name: "Request review" })).toBeInTheDocument();
  });

  it("rejects the same reviewer in two steps", async () => {
    const { user } = renderWizard();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(within(step("Approval")).getByRole("checkbox", { name: "Anna" }));
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.click(within(step("Step 2")).getByRole("checkbox", { name: "Anna" }));

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await within(step("Step 2")).findByText("A reviewer can only be in one step.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
