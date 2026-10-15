import { Queue } from "bullmq";
import {
  EMAIL_JOB_OPTIONS,
  EMAIL_QUEUE,
  MAINTENANCE_QUEUE,
  MEDIA_JOB_OPTIONS,
  MEDIA_QUEUE,
  type EmailJob,
  type MediaJob,
} from "./jobs";
import { getRedis } from "./redis";

const globalForQueues = globalThis as unknown as {
  emailQueue?: Queue<EmailJob>;
  mediaQueue?: Queue<MediaJob>;
  maintenanceQueue?: Queue;
};

// Queues reuse the app's Redis connection: while Redis is down, `add` fails
// fast instead of hanging the request.

export function getEmailQueue() {
  globalForQueues.emailQueue ??= new Queue<EmailJob>(EMAIL_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: EMAIL_JOB_OPTIONS,
  });
  return globalForQueues.emailQueue;
}

export function getMediaQueue() {
  globalForQueues.mediaQueue ??= new Queue<MediaJob>(MEDIA_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: MEDIA_JOB_OPTIONS,
  });
  return globalForQueues.mediaQueue;
}

export function getMaintenanceQueue() {
  globalForQueues.maintenanceQueue ??= new Queue(MAINTENANCE_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 1000 },
  });
  return globalForQueues.maintenanceQueue;
}
