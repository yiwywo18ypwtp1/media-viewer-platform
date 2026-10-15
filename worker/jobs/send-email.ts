import type { Job } from "bullmq";
import type { Transporter } from "nodemailer";
import type { EmailJob } from "../../src/server/jobs";

export function createSendEmail(transport: Transporter, from: string) {
  return async function sendEmail(job: Job<EmailJob>) {
    // A throw here makes BullMQ retry with backoff (see queue defaults).
    await transport.sendMail({ from, ...job.data });
  };
}
