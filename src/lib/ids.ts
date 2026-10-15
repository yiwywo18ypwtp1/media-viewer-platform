import { z } from "zod";

const uuid = z.uuid();

// IDs come from URLs and forms. Checking the format first turns a malformed id
// into a clean "not found" instead of a Postgres "invalid input syntax" error.
export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}
