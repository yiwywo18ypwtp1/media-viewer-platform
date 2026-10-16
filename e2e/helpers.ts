import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";

// The demo workspace and project created by the migrate container's seed.
export const DEMO_PROJECT = "00000000-0000-4000-8000-000000000002";
export const PASSWORD = "password123";

// Unique per run: tests may run against a stack that already has data.
export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

// A browser context per person: separate cookies, like separate people.
export async function personPage(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await login(page, email);
  return page;
}

// The fixture clip under a unique name (the asset is named after the file).
export function clipNamed(name: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "e2e-")), `${name}.mp4`);
  copyFileSync(join(__dirname, "fixtures", "clip.mp4"), path);
  return path;
}

// Uploads through the project page and waits until the worker has processed
// the file: the card's progress comes over SSE and the page refreshes itself
// when the version is ready (no reload here).
export async function uploadAndProcess(page: Page, projectId: string, name: string) {
  await page.goto(`/p/${projectId}`);
  await page.locator("input[type=file]:not([webkitdirectory])").first().setInputFiles(clipNamed(name));
  await expect(page.getByRole("listitem").filter({ hasText: `${name}.mp4` }).getByText("Uploaded")).toBeVisible();
  const card = page.getByRole("listitem").filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(card.getByRole("link", { name, exact: true })).toBeVisible();
  // Processing done: the badge disappears and the poster image shows.
  await expect(card.getByText(/Processing|Waiting/)).toHaveCount(0, { timeout: 90_000 });
  await expect(card.locator("img")).toBeVisible();
  await card.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/a\//);
  return page.url();
}

export async function waitForVideo(page: Page) {
  await page.waitForFunction(() => (document.querySelector("video")?.readyState ?? 0) >= 2, null, { timeout: 30_000 });
}
