import "server-only";
import { headers } from "next/headers";
import { logger } from "./logger";

// The id proxy.ts gave this request (undefined outside a request, e.g. at startup).
export async function getRequestId(): Promise<string | undefined> {
  try {
    return (await headers()).get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  }
}

// A logger whose lines carry the request id, so one request can be followed
// through the logs (and into the worker, for jobs it enqueues).
export async function requestLogger() {
  const requestId = await getRequestId();
  return requestId ? logger.child({ requestId }) : logger;
}
