"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getAssetAccess } from "@/features/assets/queries";
import { requireUser } from "@/features/auth/session";
import { getProjectAccess } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";
import { actionError, validationFailed, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/server/db";
import { assets, folders } from "@/server/schema";
import { getFolderInProject } from "./queries";
import { createFolderSchema, moveAssetSchema } from "./schema";

// Organising the project is an editor's job, the same people who upload.

export async function createFolder(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createFolderSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);
  const { projectId, parentId, name } = parsed.data;

  const access = await getProjectAccess(user.id, projectId);
  if (!access || !can(access.role, "upload")) return actionError("forbidden", "You can't add folders here.");
  if (parentId && !(await getFolderInProject(projectId, parentId))) {
    return actionError("not_found", "That folder no longer exists.");
  }

  const [created] = await getDb()
    .insert(folders)
    .values({ projectId, parentId, name })
    .onConflictDoNothing({ target: [folders.projectId, folders.parentId, folders.name] })
    .returning({ id: folders.id });
  if (!created) return actionError("name_taken", "A folder with this name already exists here.", { name: "Name taken." });

  revalidatePath(`/p/${projectId}`);
  return { ok: true };
}

export async function moveAsset(values: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = moveAssetSchema.safeParse(values);
  if (!parsed.success) return validationFailed(parsed.error);

  const access = await getAssetAccess(user.id, parsed.data.assetId);
  if (!access || !can(access.role, "upload")) return actionError("forbidden", "You can't move this asset.");
  const { folderId } = parsed.data;
  if (folderId && !(await getFolderInProject(access.project.id, folderId))) {
    return actionError("not_found", "That folder no longer exists.");
  }

  await getDb()
    .update(assets)
    .set({ folderId })
    .where(and(eq(assets.id, access.asset.id), eq(assets.projectId, access.project.id)));
  revalidatePath(`/p/${access.project.id}`);
  revalidatePath(`/a/${access.asset.id}`);
  return { ok: true };
}
