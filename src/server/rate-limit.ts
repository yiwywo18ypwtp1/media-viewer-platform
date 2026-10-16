import "server-only";
import { getRedis } from "./redis";

// Failure counters in Redis with a fixed window: the first failure starts a
// 15-minute window, and while a counter is at its limit every attempt is
// refused without even checking the password. Shared by all web instances
// (it's in Redis), so scaling web doesn't multiply the allowance.

export type Limit = { key: string; max: number };

const WINDOW_SECONDS = 15 * 60;

export async function isLimited(limits: Limit[]): Promise<boolean> {
  const counts = await getRedis().mget(...limits.map((limit) => limit.key));
  return counts.some((count, index) => Number(count ?? 0) >= limits[index].max);
}

export async function countFailure(limits: Limit[]): Promise<void> {
  const pipeline = getRedis().multi();
  for (const { key } of limits) {
    pipeline.incr(key);
    // NX: only the first failure sets the window; later ones don't extend it.
    pipeline.expire(key, WINDOW_SECONDS, "NX");
  }
  await pipeline.exec();
}

export const RATE_LIMIT_WINDOW_MINUTES = WINDOW_SECONDS / 60;
