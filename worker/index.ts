import { writeFile } from "node:fs/promises";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import nodemailer from "nodemailer";
import { parseEnv, workerEnvSchema, type WorkerEnv } from "../src/server/env-schema";
import { EMAIL_QUEUE } from "../src/server/jobs";
import { createLogger } from "../src/server/logger";
import { createSendEmail } from "./jobs/send-email";

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
  // BullMQ workers block on Redis and must retry forever, hence `null`.
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on("error", (error) => log.warn({ err: error }, "redis connection error"));

  const mailer = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT });

  const workers = [
    new Worker(EMAIL_QUEUE, createSendEmail(mailer, env.MAIL_FROM), {
      connection: redis,
      concurrency: 5,
    }),
  ];

  for (const worker of workers) {
    worker.on("completed", (job) => log.info({ queue: worker.name, jobId: job.id }, "job completed"));
    worker.on("failed", (job, error) =>
      log.error({ queue: worker.name, jobId: job?.id, attempt: job?.attemptsMade, err: error }, "job failed"),
    );
  }

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
    // close() stops taking new jobs and waits for the active ones to finish.
    await Promise.all(workers.map((worker) => worker.close()));
    await redis.quit();
    log.info("shutdown complete");
    process.exit(0);
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  log.info({ queues: workers.map((worker) => worker.name) }, "worker started");
}

void main();
