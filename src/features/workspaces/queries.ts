import "server-only";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { getDb } from "@/server/db";
import { invitations, projects, users, workspaceMembers, workspaces } from "@/server/schema";
import { hashToken } from "@/server/tokens";
import type { Role } from "./roles";

// --- Access checks ---
// Every page and action that touches a workspace or project goes through one of
// these. They answer "is this user a member, and with which role?" from the
// database on every request, so removing a member takes effect immediately.
// null means "no access": callers respond with 404 so we don't reveal what exists.

export async function getWorkspaceAccess(userId: string, workspaceId: unknown) {
  if (!isUuid(workspaceId)) return null;

  const [row] = await getDb()
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaces.id, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);

  if (!row) return null;
  return { workspace: { id: row.id, name: row.name }, role: row.role };
}

export async function getProjectAccess(userId: string, projectId: unknown) {
  if (!isUuid(projectId)) return null;

  const [row] = await getDb()
    .select({
      id: projects.id,
      name: projects.name,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(projects)
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(
      and(eq(projects.id, projectId), isNull(projects.archivedAt), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);

  if (!row) return null;
  return {
    project: { id: row.id, name: row.name },
    workspace: { id: row.workspaceId, name: row.workspaceName },
    role: row.role,
  };
}

// --- Page data ---

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: Role;
  projects: { id: string; name: string }[];
};

export async function listWorkspacesWithProjects(userId: string): Promise<WorkspaceSummary[]> {
  const db = getDb();
  const memberships = await db
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.name));

  if (memberships.length === 0) return [];

  // One query for all projects instead of one per workspace.
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, workspaceId: projects.workspaceId })
    .from(projects)
    .where(
      and(
        inArray(
          projects.workspaceId,
          memberships.map((m) => m.id),
        ),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(asc(projects.name));

  return memberships.map((m) => ({
    ...m,
    projects: projectRows.filter((p) => p.workspaceId === m.id),
  }));
}

export async function listProjects(workspaceId: string) {
  return getDb()
    .select({ id: projects.id, name: projects.name, createdAt: projects.createdAt })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)))
    .orderBy(asc(projects.name));
}

export async function listMembers(workspaceId: string) {
  return getDb()
    .select({ userId: users.id, name: users.name, email: users.email, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(users.name));
}

export async function listPendingInvitations(workspaceId: string) {
  return getDb()
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(
      and(
        eq(invitations.workspaceId, workspaceId),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitations.email));
}

// For the /invite/[token] page. Returns null for unknown, used or expired links.
export async function getPendingInvitation(token: string) {
  const [row] = await getDb()
    .select({
      email: invitations.email,
      role: invitations.role,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      inviterName: users.name,
    })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .innerJoin(users, eq(users.id, invitations.invitedBy))
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
