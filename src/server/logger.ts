import pino from "pino";

// JSON logs to stdout; Docker collects them. LOG_LEVEL is read directly
// (not via getEnv) because a logger must work even when env validation fails.
export function createLogger(service: "web" | "worker" | "migrate") {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const logger = createLogger("web");
