import { expect, test } from "@playwright/test";
import { DEMO_PROJECT, personPage, unique, uploadAndProcess, waitForVideo } from "./helpers";

// 4. A password-protected share link: a guest comments, the owner revokes it,
// the guest loses access.
test("a guest comments through a password link and loses access when it's revoked", async ({ browser }) => {
  const editor = await personPage(browser, "editor@example.com");
  await uploadAndProcess(editor, DEMO_PROJECT, unique("share-clip"));

  await editor.getByRole("button", { name: "New share link" }).click();
  await editor.getByLabel("Password (optional)").fill("letmein42");
  await editor.getByRole("button", { name: "Create link" }).click();
  const link = await editor.getByLabel("New share link").inputValue();
  // Only the server's hash is kept: the URL is shown this once.
  expect(link).toMatch(/\/s\/[\w-]{43}$/);

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "This link is protected" })).toBeVisible();
  await guest.getByLabel("Password").fill("not-it");
  await guest.getByRole("button", { name: "Open" }).click();
  await expect(guest.getByText("Wrong password.")).toBeVisible();
  await guest.getByLabel("Password").fill("letmein42");
  await guest.getByRole("button", { name: "Open" }).click();
  await waitForVideo(guest);

  const note = unique("Music starts too early");
  await guest.getByLabel("Your name, shown with your comments").fill("Gina Guest");
  await guest.getByRole("button", { name: "Continue" }).click();
  await guest.getByRole("combobox", { name: "Comment" }).fill(note);
  await guest.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(guest.getByText(note)).toBeVisible();

  // The team sees the guest's comment (live, over SSE).
  await expect(editor.getByText(note)).toBeVisible();
  await expect(editor.locator("article", { hasText: note })).toContainText("Gina Guest");

  editor.once("dialog", (dialog) => void dialog.accept());
  await editor.getByRole("button", { name: "Revoke" }).first().click();
  await expect(editor.getByRole("region", { name: "Share links" })).toContainText("Revoked");

  // The open guest page notices (its periodic link check, or a refused segment)...
  await expect(guest.getByText(/This link was turned off|no longer available/).first()).toBeVisible({ timeout: 30_000 });
  // ...and the link is dead for good.
  await guest.reload();
  await expect(guest.getByRole("heading", { name: "This link isn’t available" })).toBeVisible();
});
