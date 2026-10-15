import { Queue } from "bullmq";
import { EMAIL_QUEUE, type EmailJob } from "./jobs";
import { getRedis } from "./redis";

const globalForQueues = globalThis as unknown as { emailQueue?: Queue<EmailJob> };

export function getEmailQueue() {
  // Reuses the app's Redis connection: while Redis is down, `add` fails fast
  // instead of hanging the request.
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
