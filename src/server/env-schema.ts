import { z } from "zod";

// Variables shared by web and worker. Each process validates its own schema
// at startup and refuses to run with an incomplete environment.
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_URL: z.url(),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  // Address used by our containers to reach MinIO (e.g. http://minio:9000).
  S3_ENDPOINT: z.url(),
});

export const webEnvSchema = baseSchema.extend({
  // Address the browser uses for presigned URLs (e.g. http://localhost:9000).
  // Differs from S3_ENDPOINT because the signature includes the host.
  S3_PUBLIC_ENDPOINT: z.url(),
});

export const workerEnvSchema = baseSchema.extend({
  // Whisper service (bonus, profile "transcription"). Unset: no transcripts.
  WHISPER_URL: z.url().optional(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  MAIL_FROM: z.string().min(1),
});

export type WebEnv = z.infer<typeof webEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join(".");
    const reason = source[name] === undefined ? "missing" : issue.message;
    return `  - ${name}: ${reason}`;
  });
  throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
}
