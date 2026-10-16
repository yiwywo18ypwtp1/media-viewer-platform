import { defineConfig, devices } from "@playwright/test";

// E2E tests against a running stack: locally (`npx playwright test` with the
// compose stack up) or in the e2e container (compose profile "e2e").
const hostRules = process.env.E2E_HOST_RULES;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e-results/artifacts",
  // Real uploads and transcoding: give each test room.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  // The tests share the seeded demo users and project, so one at a time.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "e2e-results/report", open: "never" }]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // In the container: "localhost" resolves to the caddy service (see docker-compose.yml).
    launchOptions: { args: hostRules ? [`--host-resolver-rules=${hostRules}`] : [] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 1000 } } }],
});
