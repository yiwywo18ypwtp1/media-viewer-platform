import { expect, test, type Page } from "@playwright/test";
import { DEMO_PROJECT, personPage, unique, uploadAndProcess } from "./helpers";

// 3. Two sequential steps: "any" (reviewer), then "all" (editor and owner) -> approved.
test("a two-step review ends approved after any-then-all decisions", async ({ browser }) => {
  const editor = await personPage(browser, "editor@example.com");
  const assetUrl = await uploadAndProcess(editor, DEMO_PROJECT, unique("approval-clip"));

  await editor.getByRole("button", { name: "Request review" }).click();
  await editor.getByRole("button", { name: "Next", exact: true }).click();
  const first = editor.getByRole("group", { name: "Approval" });
  await first.getByRole("checkbox", { name: "Rita Reviewer" }).check();
  await first.getByRole("radio", { name: /any one reviewer/i }).check();
  await editor.getByRole("button", { name: "Add step" }).click();
  const second = editor.getByRole("group", { name: "Step 2" });
  await second.getByRole("checkbox", { name: "Eddie Editor" }).check();
  await second.getByRole("checkbox", { name: "Olivia Owner" }).check();
  await second.getByRole("radio", { name: /all reviewers/i }).check();
  await editor.getByRole("button", { name: "Next", exact: true }).click();
  await editor.getByRole("button", { name: "Request review" }).click();

  const review = (page: Page) => page.getByRole("region", { name: "Review" });
  await expect(review(editor)).toContainText("step 1 of 2");
  // Not the editor's turn yet.
  await expect(review(editor).getByRole("button", { name: "Approve" })).toHaveCount(0);

  const reviewer = await personPage(browser, "reviewer@example.com");
  await reviewer.goto(assetUrl);
  await review(reviewer).getByRole("button", { name: "Approve" }).click();
  await expect(review(reviewer)).toContainText("step 2 of 2");

  // Step 2 is "all": one approval isn't enough.
  await editor.reload();
  await review(editor).getByRole("button", { name: "Approve" }).click();
  await expect(review(editor)).toContainText("step 2 of 2");

  const owner = await personPage(browser, "owner@example.com");
  await owner.goto(assetUrl);
  await review(owner).getByRole("button", { name: "Approve" }).click();
  await expect(review(owner)).toContainText("Approved");
  // The asset itself carries the final status.
  await expect(owner.getByRole("heading", { level: 1 })).toContainText("Approved");
});
