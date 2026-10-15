import type { DefaultJobOptions } from "bullmq";

// Queue names, job payloads and job options shared by web (producer) and
// worker (consumer, and producer for re-enqueued jobs). Kept free of
// env/connection code so both processes can import it.

export const EMAIL_QUEUE = "email";

// Emails are rendered by the producer, so the worker only delivers them.
export type EmailJob = {
  to: string;
  subject: string;
  text: string;
};

export const EMAIL_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const MEDIA_QUEUE = "media";

// jobId is the versionId, so enqueueing the same version twice is a no-op.
export type MediaJob = { versionId: string };

export const MEDIA_JOB_OPTIONS: DefaultJobOptions = {
  // Task 3.3: at most 3 attempts with exponential backoff (10 s, 20 s).
  attempts: 3,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

export const MAINTENANCE_QUEUE = "maintenance";

// Delayed job on the maintenance queue: fires 24 h before a review is due.
export type ReviewReminderJob = { requestId: string };
