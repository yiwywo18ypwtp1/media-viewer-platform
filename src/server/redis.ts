import { Redis } from "ioredis";
import { getEnv } from "./env";
import { logger } from "./logger";

function createRedis() {
  const redis = new Redis(getEnv().REDIS_URL, {
    // While Redis is down, fail commands immediately instead of queueing them,
    // so requests (and /api/health) degrade fast. ioredis keeps reconnecting
    // in the background, so the app recovers without a restart.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  redis.on("error", (error) => logger.warn({ err: error }, "redis connection error"));
  return redis;
}

const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis() {
  globalForRedis.redis ??= createRedis();
  return globalForRedis.redis;
}
