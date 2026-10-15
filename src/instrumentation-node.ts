import { getEnv } from "./server/env";

try {
  getEnv();
} catch (error) {
  // Fail fast with a readable list instead of crashing on the first request.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
