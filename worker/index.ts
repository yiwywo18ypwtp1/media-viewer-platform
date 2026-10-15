import { writeFile } from "node:fs/promises";
import { Redis } from "ioredis";
import { parseEnv, workerEnvSchema, type WorkerEnv } from "../src/server/env-schema";
import { createLogger } from "../src/server/logger";

const log = createLogger("worker");

// Docker HEALTHCHECK reads this file's age (see Dockerfile).
const HEARTBEAT_FILE = "/tmp/worker-heartbeat";
const HEARTBEAT_INTERVAL_MS = 5000;

function loadEnv(): WorkerEnv {
  try {
    return parseEnv(workerEnvSchema, process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main() {
  const env = loadEnv();
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on("error", (error) => log.warn({ err: error }, "redis connection error"));

  // Heartbeat only while Redis answers, so "healthy" means "can take jobs".
  const heartbeat = setInterval(async () => {
    try {
      await redis.ping();
      await writeFile(HEARTBEAT_FILE, String(Date.now()));
    } catch (error) {
      log.warn({ err: error }, "heartbeat skipped");
    }
  }, HEARTBEAT_INTERVAL_MS);

  async function shutdown(signal: NodeJS.Signals) {
    log.info({ signal }, "shutting down");
    clearInterval(heartbeat);
    // Queue workers will be closed here (waiting for the active job) once they exist.
    await redis.quit();
    log.info("shutdown complete");
    process.exit(0);
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  log.info("worker started");
}

void main();
