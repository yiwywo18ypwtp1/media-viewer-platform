import { Queue } from "bullmq";
import { EMAIL_QUEUE, MEDIA_QUEUE, type EmailJob, type MediaJob } from "./jobs";
import { getRedis } from "./redis";

const globalForQueues = globalThis as unknown as {
  emailQueue?: Queue<EmailJob>;
  mediaQueue?: Queue<MediaJob>;
};

// Queues reuse the app's Redis connection: while Redis is down, `add` fails
// fast instead of hanging the request.

export function getEmailQueue() {
  globalForQueues.emailQueue ??= new Queue<EmailJob>(EMAIL_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return globalForQueues.emailQueue;
}

export function getMediaQueue() {
  globalForQueues.mediaQueue ??= new Queue<MediaJob>(MEDIA_QUEUE, {
    connection: getRedis(),
    defaultJobOptions: {
      // Task 3.3: at most 3 attempts with exponential backoff.
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
  return globalForQueues.mediaQueue;
}
