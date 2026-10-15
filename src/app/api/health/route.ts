import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { getRedis } from "@/server/redis";
import { getS3 } from "@/server/s3";

export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 2000;

type CheckResult = { ok: true; latencyMs: number } | { ok: false; error: string };

async function runCheck(
  name: string,
  check: (signal: AbortSignal) => Promise<unknown>,
): Promise<CheckResult> {
  const startedAt = performance.now();
  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(new Error("timeout")));
  });

  try {
    await Promise.race([check(signal), timedOut]);
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    // Details go to the log only: this endpoint is public and must not leak
    // internal hostnames or driver messages.
    logger.warn({ err: error, dependency: name }, "health check failed");
    const isTimeout = error instanceof Error && error.message === "timeout";
    return { ok: false, error: isTimeout ? "timeout" : "unreachable" };
  }
}

export async function GET() {
  const [postgres, redis, s3] = await Promise.all([
    runCheck("postgres", () => getDb().execute(sql`select 1`)),
    runCheck("redis", () => getRedis().ping()),
    runCheck("s3", (signal) =>
      getS3().send(new HeadBucketCommand({ Bucket: getEnv().S3_BUCKET }), { abortSignal: signal }),
    ),
  ]);

  const checks = { postgres, redis, s3 };
  const healthy = Object.values(checks).every((check) => check.ok);

  return Response.json(
    { status: healthy ? "ok" : "unavailable", checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
