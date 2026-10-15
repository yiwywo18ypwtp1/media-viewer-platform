import { getEnv } from "./server/env";
import { closeAllStreams, connectEventHub } from "./server/event-hub";
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
connectEventHub();

// Next's own SIGTERM handler waits for open requests before exiting. SSE
// streams never end on their own, so end them; browsers reconnect by themselves.
process.once("SIGTERM", closeAllStreams);
