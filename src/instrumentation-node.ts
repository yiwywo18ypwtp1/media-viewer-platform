import { getEnv } from "./server/env";
import { getRedis } from "./server/redis";

try {
  getEnv();
} catch (error) {
  // Fail fast with a readable list instead of crashing on the first request.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

// Connect eagerly: the Redis client fails fast while not connected, so a lazy
// connection would make the first request after startup fail.
getRedis();
