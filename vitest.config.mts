import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // Pure logic runs in plain Node (fast, no DOM), only component tests pay
    // for jsdom, and integration tests run only where the services are.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "worker/**/*.test.ts"],
          exclude: ["**/*.integration.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        // Against the real Postgres, Redis and MinIO of the compose stack
        // (`docker compose --profile integration run --rm integration`).
        extends: true,
        resolve: { alias: { "server-only": path.resolve(import.meta.dirname, "src/test/server-only-stub.ts") } },
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          // One database for all files: run them one after another.
          fileParallelism: false,
        },
      },
    ],
  },
});
