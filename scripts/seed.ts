import { inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { hashPassword } from "../src/server/password";
import * as schema from "../src/server/schema";

// Demo data for reviewers of this project. Idempotent: runs on every
// `docker compose up` and only inserts what's missing. Fixed ids make
// "already seeded?" a primary-key conflict instead of a lookup by name.
export const DEMO_PASSWORD = "password123";

const DEMO_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_PROJECT_ID = "00000000-0000-4000-8000-000000000002";

const demoUsers = [
  { email: "owner@example.com", name: "Olivia Owner", role: "owner" },
  { email: "editor@example.com", name: "Eddie Editor", role: "editor" },
  { email: "reviewer@example.com", name: "Rita Reviewer", role: "reviewer" },
] as const;

export async function seed(db: PostgresJsDatabase<typeof schema>) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db
    .insert(schema.users)
    .values(demoUsers.map(({ email, name }) => ({ email, name, passwordHash })))
    .onConflictDoNothing({ target: schema.users.email });

  const users = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.email, demoUsers.map((user) => user.email)));
  const idByEmail = new Map(users.map((user) => [user.email, user.id]));

  await db
    .insert(schema.workspaces)
    .values({ id: DEMO_WORKSPACE_ID, name: "Demo Studio" })
    .onConflictDoNothing();

  await db
    .insert(schema.workspaceMembers)
    .values(
      demoUsers.map((user) => ({
        workspaceId: DEMO_WORKSPACE_ID,
        userId: idByEmail.get(user.email)!,
        role: user.role,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(schema.projects)
    .values({ id: DEMO_PROJECT_ID, workspaceId: DEMO_WORKSPACE_ID, name: "Spring Campaign" })
    .onConflictDoNothing();
}
