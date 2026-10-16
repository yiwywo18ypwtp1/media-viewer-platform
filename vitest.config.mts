import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // Two projects so pure logic keeps running in plain Node (fast, no DOM)
    // and only component tests pay for jsdom.
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts", "worker/**/*.test.ts"], environment: "node" },
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
    ],
  },
});
