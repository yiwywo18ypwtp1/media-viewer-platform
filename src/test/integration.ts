import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll } from "vitest";
import type { CurrentUser } from "@/features/auth/session";
import type { Role } from "@/features/workspaces/roles";
import { getDb } from "@/server/db";
import { getEmailQueue, getMaintenanceQueue, getMediaQueue } from "@/server/queues";
import { getRedis } from "@/server/redis";
import { assets, assetVersions, projects, users, workspaceMembers, workspaces } from "@/server/schema";

// Fixtures for integration tests: rows written straight into the real
// database, unique per call, so tests don't depend on each other or on the
// seed. The code under test is the real thing (no mocks).

export type Team = { workspaceId: string; projectId: string } & Record<Role, CurrentUser>;

async function createUser(name: string): Promise<CurrentUser> {
  const email = `${name.toLowerCase()}-${randomUUID()}@integration.test`;
  const [user] = await getDb()
    .insert(users)
    .values({ email, name, passwordHash: "not-used" })
    .returning({ id: users.id, email: users.email, name: users.name });
  return user;
}

// A workspace with one member per role and a project.
export async function createTeam(): Promise<Team> {
  const db = getDb();
  const [workspace] = await db.insert(workspaces).values({ name: "Integration" }).returning({ id: workspaces.id });
  const team = {
    owner: await createUser("Owner"),
    editor: await createUser("Editor"),
    reviewer: await createUser("Reviewer"),
    viewer: await createUser("Viewer"),
  };
  await db.insert(workspaceMembers).values(
    (Object.keys(team) as Role[]).map((role) => ({ workspaceId: workspace.id, userId: team[role].id, role })),
  );
  const [project] = await db
    .insert(projects)
    .values({ workspaceId: workspace.id, name: "Integration project" })
    .returning({ id: projects.id });
  return { workspaceId: workspace.id, projectId: project.id, ...team };
}

export async function addMember(team: Team, role: Role, name = "Extra") {
  const user = await createUser(name);
  await getDb().insert(workspaceMembers).values({ workspaceId: team.workspaceId, userId: user.id, role });
  return user;
}

export async function removeMember(team: Team, user: CurrentUser) {
  await getDb()
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, team.workspaceId), eq(workspaceMembers.userId, user.id)));
}

// An asset with one (already processed) version, for review tests.
export async function createAsset(team: Team) {
  const db = getDb();
  const [asset] = await db
    .insert(assets)
    .values({ projectId: team.projectId, name: `asset-${randomUUID().slice(0, 8)}`, kind: "video" })
    .returning({ id: assets.id });
  const [version] = await db
    .insert(assetVersions)
    .values({
      assetId: asset.id,
      number: 1,
      uploadedBy: team.editor.id,
      originalKey: `originals/${randomUUID()}`,
      originalSize: 1,
      originalMime: "video/mp4",
      originalChecksum: "0".repeat(64),
      processingState: "ready",
      durationMs: 10_000,
    })
    .returning({ id: assetVersions.id });
  return { assetId: asset.id, versionId: version.id };
}

// Open connections keep the test process alive; close them after each file.
afterAll(async () => {
  await Promise.all([getMediaQueue().close(), getEmailQueue().close(), getMaintenanceQueue().close()]);
  await getRedis().quit();
  await getDb().$client.end();
});
