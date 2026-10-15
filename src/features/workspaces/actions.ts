"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { actionError, validationFailed, type ActionResult } from "@/lib/action-result";
import { isUuid } from "@/lib/ids";
import { getDb } from "@/server/db";
import { invitationEmail } from "@/server/emails";
import { getEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { getEmailQueue } from "@/server/queues";
import { invitations, projects, users, workspaceMembers, workspaces } from "@/server/schema";
import { generateToken, hashToken } from "@/server/tokens";
import { getWorkspaceAccess } from "./queries";
import { can, ROLE_LABELS } from "./roles";
import { createProjectSchema, createWorkspaceSchema, inviteMemberSchema } from "./schema";

// The logic lives in the actions themselves: these operations have no Route
// Handler counterpart, so there is no second caller to share it with.

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Thrown when a request bypasses the UI (which never offers these actions to
// users without the role); the error boundary shows a generic error page.
class NotAllowedError extends Error {
  constructor() {
    super("You don't have access to do that.");
  }
}

export async function createWorkspace(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createWorkspaceSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);

  const workspaceId = await getDb().transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: parsed.data.name })
      .returning({ id: workspaces.id });
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
    return workspace.id;
  });

  redirect(`/w/${workspaceId}`);
}

export async function createProject(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createProjectSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);

  const access = await getWorkspaceAccess(user.id, parsed.data.workspaceId);
  if (!access || !can(access.role, "createProject")) {
    return actionError("forbidden", "You don't have access to create projects here.");
  }

  const [project] = await getDb()
    .insert(projects)
    .values({ workspaceId: access.workspace.id, name: parsed.data.name })
    .returning({ id: projects.id });

  redirect(`/p/${project.id}`);
}

export async function inviteMember(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = inviteMemberSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);
  const { email, role } = parsed.data;

  const access = await getWorkspaceAccess(user.id, parsed.data.workspaceId);
  if (!access || !can(access.role, "manageMembers")) {
    return actionError("forbidden", "Only owners can invite people.");
  }
  const workspaceId = access.workspace.id;
  const db = getDb();

  const [existingMember] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.email, email)))
    .limit(1);
  if (existingMember) {
    return actionError("already_member", "Already a member.", {
      email: "This person is already a member of the workspace.",
    });
  }

  const token = generateToken();
  await db.transaction(async (tx) => {
    // Re-inviting replaces the previous pending invitation (new link, new role),
    // so there is never more than one live link per email.
    await tx
      .delete(invitations)
      .where(
        and(eq(invitations.workspaceId, workspaceId), eq(invitations.email, email), isNull(invitations.acceptedAt)),
      );
    await tx.insert(invitations).values({
      workspaceId,
      email,
      role,
      tokenHash: hashToken(token),
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
  });

  try {
    await getEmailQueue().add(
      "invitation",
      invitationEmail({
        to: email,
        workspaceName: access.workspace.name,
        inviterName: user.name,
        role: ROLE_LABELS[role].toLowerCase(),
        url: `${getEnv().APP_URL}/invite/${token}`,
      }),
    );
  } catch (error) {
    logger.error({ err: error }, "failed to enqueue invitation email");
    return actionError("email_unavailable", "Invitation saved, but the email couldn't be sent. Invite again in a minute.");
  } finally {
    revalidatePath(`/w/${workspaceId}`);
  }

  return { ok: true };
}

export async function revokeInvitation(workspaceId: unknown, invitationId: unknown) {
  const user = await requireUser();
  const access = await getWorkspaceAccess(user.id, workspaceId);
  if (!access || !can(access.role, "manageMembers") || !isUuid(invitationId)) throw new NotAllowedError();

  await getDb()
    .delete(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.workspaceId, access.workspace.id),
        isNull(invitations.acceptedAt),
      ),
    );
  revalidatePath(`/w/${access.workspace.id}`);
}

export async function removeMember(workspaceId: unknown, memberId: unknown) {
  const user = await requireUser();
  const access = await getWorkspaceAccess(user.id, workspaceId);
  if (!access || !can(access.role, "manageMembers") || !isUuid(memberId)) throw new NotAllowedError();

  await getDb().transaction(async (tx) => {
    // Lock the owner rows so two owners removing each other at the same time
    // can't leave the workspace with no owner.
    const owners = await tx
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, access.workspace.id), eq(workspaceMembers.role, "owner")))
      .for("update");

    const removingLastOwner = owners.length === 1 && owners[0].userId === memberId;
    if (removingLastOwner) throw new Error("A workspace needs at least one owner.");

    await tx
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, access.workspace.id), eq(workspaceMembers.userId, memberId)));
  });

  if (memberId === user.id) redirect("/");
  revalidatePath(`/w/${access.workspace.id}`);
}

export async function acceptInvitation(token: unknown) {
  const user = await requireUser();
  if (typeof token !== "string") throw new NotAllowedError();

  const workspaceId = await getDb().transaction(async (tx) => {
    // Atomic, like password reset: only one request can accept the link.
    // Matching the email means a forwarded link can't be used by someone else.
    const [invitation] = await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(invitations.tokenHash, hashToken(token)),
          eq(invitations.email, user.email),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .returning({ workspaceId: invitations.workspaceId, role: invitations.role });
    if (!invitation) return null;

    // Already a member (e.g. accepted an older link): keep the existing role.
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role })
      .onConflictDoNothing();
    return invitation.workspaceId;
  });

  // Invalid, used or someone else's link: the invite page explains which.
  if (!workspaceId) redirect(`/invite/${token}`);
  redirect(`/w/${workspaceId}`);
}
