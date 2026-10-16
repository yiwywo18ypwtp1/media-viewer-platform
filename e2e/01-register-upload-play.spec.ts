import { expect, test } from "@playwright/test";
import { unique, uploadAndProcess, waitForVideo } from "./helpers";

// 1. Sign up, upload a video, wait for processing over SSE, play it.
test("a new user uploads a video and plays it once processed", async ({ page }) => {
  const email = `${unique("e2e")}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Uploader");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/\/register/);

  await page.getByLabel("New workspace").fill(unique("Workspace"));
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.getByLabel("New project").fill("Launch film");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/p\//);
  const projectId = new URL(page.url()).pathname.split("/")[2];

  // No reloads from here on: progress and "ready" arrive over SSE.
  const name = unique("first-cut");
  await uploadAndProcess(page, projectId, name);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);

  await waitForVideo(page);
  // HLS through hls.js: the <video> plays a MediaSource blob.
  expect(await page.locator("video").evaluate((v: HTMLVideoElement) => v.src.startsWith("blob:"))).toBe(true);
  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.5);
});
