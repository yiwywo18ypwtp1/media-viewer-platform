import { writeFile } from "node:fs/promises";
import { Queue, Worker } from "bullmq";
import { drizzle } from "drizzle-orm/postgres-js";
import { Redis } from "ioredis";
import nodemailer from "nodemailer";
import postgres from "postgres";
import { parseEnv, workerEnvSchema, type WorkerEnv } from "../src/server/env-schema";
import { EMAIL_QUEUE, MAINTENANCE_QUEUE, MEDIA_QUEUE, type MediaJob } from "../src/server/jobs";
import { createLogger } from "../src/server/logger";
import { createS3Client } from "../src/server/s3-client";
import * as schema from "../src/server/schema";
import { startTracing } from "../src/server/tracing";
import { createCleanupUploads } from "./jobs/cleanup-uploads";
import { createProcessMedia } from "./jobs/process-media";
import { createReviewReminder } from "./jobs/review-reminder";
import { createSendEmail } from "./jobs/send-email";
import { createSweepPending } from "./jobs/sweep-pending";

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
  // Traces to Jaeger when OTEL_EXPORTER_OTLP_ENDPOINT is set; media jobs
  // continue the trace of the request that queued them.
  const tracing = startTracing("worker");
  // BullMQ workers block on Redis and must retry forever, hence `null`.
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  redis.on("error", (error) => log.warn({ err: error }, "redis connection error"));

  const sql = postgres(env.DATABASE_URL, { max: 5 });
  const db = drizzle(sql, { schema });
  const s3 = createS3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
  });
  const mailer = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT });

  const mediaQueue = new Queue<MediaJob>(MEDIA_QUEUE, { connection: redis });
  const maintenance = new Queue(MAINTENANCE_QUEUE, { connection: redis });

  const processMedia = createProcessMedia({ db, s3, bucket: env.S3_BUCKET, publisher: redis, log });
  const cleanupUploads = createCleanupUploads({ db, s3, bucket: env.S3_BUCKET, log });
  const sweepPending = createSweepPending({ db, mediaQueue, log });
  const reviewReminder = createReviewReminder({ db, mailer, from: env.MAIL_FROM, appUrl: env.APP_URL, log });

  const workers = [
    // Task 3.3: one worker transcodes at most 2 videos at a time.
    new Worker(MEDIA_QUEUE, processMedia, { connection: redis, concurrency: 2 }),
    new Worker(EMAIL_QUEUE, createSendEmail(mailer, env.MAIL_FROM), { connection: redis, concurrency: 5 }),
    new Worker(
      MAINTENANCE_QUEUE,
      async (job) => {
        if (job.name === "cleanup-uploads") await cleanupUploads();
        if (job.name === "sweep-pending") await sweepPending();
        if (job.name === "review-reminder") await reviewReminder(job);
      },
      { connection: redis },
    ),
  ];

  // Idempotent: every worker replica upserts the same scheduler, and BullMQ
  // runs each tick once no matter how many replicas there are.
  await maintenance.upsertJobScheduler("cleanup-uploads", { every: 60 * 60 * 1000 }, { name: "cleanup-uploads" });
  await maintenance.upsertJobScheduler("sweep-pending", { every: 60 * 1000 }, { name: "sweep-pending" });

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
    await Promise.all([maintenance.close(), mediaQueue.close()]);
    await redis.quit();
    await sql.end();
    await tracing?.shutdown();
    log.info("shutdown complete");
    process.exit(0);
  }

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  log.info({ queues: workers.map((worker) => worker.name) }, "worker started");
}

void main();
