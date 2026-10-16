import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { isUuid } from "@/lib/ids";
import { getDb } from "@/server/db";
import { folders } from "@/server/schema";

// Callers check project access first; these only shape data, and every lookup
// is scoped to the project so a folder id from another project never matches.

export type Folder = { id: string; name: string };

export async function getFolderInProject(projectId: string, folderId: unknown): Promise<Folder | null> {
  if (!isUuid(folderId)) return null;
  const [folder] = await getDb()
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.projectId, projectId)))
    .limit(1);
  return folder ?? null;
}

export async function listSubfolders(projectId: string, parentId: string | null): Promise<Folder[]> {
  return getDb()
    .select({ id: folders.id, name: folders.name })
    .from(folders)
    .where(and(eq(folders.projectId, projectId), parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId)))
    .orderBy(asc(sql`lower(${folders.name})`));
}

// Breadcrumbs: the folder and its ancestors, top level first. One recursive
// query instead of one query per level.
export async function folderTrail(folderId: string): Promise<Folder[]> {
  const rows = await getDb().execute<{ id: string; name: string; depth: number }>(sql`
    with recursive trail as (
      select id, name, parent_id, 0 as depth from ${folders} where id = ${folderId}
      union all
      select f.id, f.name, f.parent_id, t.depth + 1 from ${folders} f join trail t on f.id = t.parent_id
    )
    select id, name, depth from trail order by depth desc
  `);
  return rows.map(({ id, name }) => ({ id, name }));
}

// Every folder of the project as "A / B / C", for the "move to" picker.
export async function listFolderPaths(projectId: string): Promise<{ id: string; path: string }[]> {
  const rows = await getDb().execute<{ id: string; path: string }>(sql`
    with recursive tree as (
      select id, name::text as path from ${folders} where project_id = ${projectId} and parent_id is null
      union all
      select f.id, t.path || ' / ' || f.name from ${folders} f join tree t on f.parent_id = t.id
    )
    select id, path from tree order by lower(path)
  `);
  return [...rows];
}

// Finds or creates each folder of `names` under `parentId` and returns the
// deepest one. Insert-or-select on the sibling-name constraint, so two files
// of the same dropped folder uploading at once end up in one folder.
export async function ensureFolderPath(projectId: string, parentId: string | null, names: string[]) {
  const db = getDb();
  let current = parentId;
  for (const name of names) {
    const [created] = await db
      .insert(folders)
      .values({ projectId, parentId: current, name })
      .onConflictDoNothing({ target: [folders.projectId, folders.parentId, folders.name] })
      .returning({ id: folders.id });
    if (created) {
      current = created.id;
      continue;
    }
    const [existing] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.projectId, projectId),
          current ? eq(folders.parentId, current) : isNull(folders.parentId),
          eq(folders.name, name),
        ),
      )
      .limit(1);
    current = existing.id;
  }
  return current;
}
