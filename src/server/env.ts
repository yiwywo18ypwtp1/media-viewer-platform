import { parseEnv, webEnvSchema, type WebEnv } from "./env-schema";

let cached: WebEnv | undefined;

// Lazy so that `next build` (which imports route modules) doesn't need
// runtime secrets. Validation happens on server start in instrumentation.ts.
export function getEnv(): WebEnv {
  cached ??= parseEnv(webEnvSchema, process.env);
  return cached;
}
