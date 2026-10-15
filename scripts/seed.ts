import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword } from "../src/server/password";
import * as schema from "../src/server/schema";

// Demo data for reviewers of this project. Idempotent: runs on every
// `docker compose up` and only inserts what's missing.
export const DEMO_PASSWORD = "password123";

const demoUsers = [
  { email: "owner@example.com", name: "Olivia Owner" },
  { email: "editor@example.com", name: "Eddie Editor" },
  { email: "reviewer@example.com", name: "Rita Reviewer" },
];

export async function seed(db: PostgresJsDatabase<typeof schema>) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db
    .insert(schema.users)
    .values(demoUsers.map((user) => ({ ...user, passwordHash })))
    .onConflictDoNothing({ target: schema.users.email });
}
