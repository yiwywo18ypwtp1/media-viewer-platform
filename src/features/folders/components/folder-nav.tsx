import Link from "next/link";
import { listHref, type ListParams } from "@/features/assets/list-params";
import { getI18n } from "@/i18n/server";
import type { Folder } from "../queries";
import { CreateFolderForm } from "./create-folder-form";

type Props = {
  projectId: string;
  projectName: string;
  params: ListParams;
  trail: Folder[];
  subfolders: Folder[];
  canEdit: boolean;
};

// Server Component: breadcrumbs and the open folder's subfolders, as plain
// links that change ?folder= (same idea as the toolbar: the URL is the state).
export async function FolderNav({ projectId, projectName, params, trail, subfolders, canEdit }: Props) {
  const { t } = await getI18n();
  const crumbs = [{ id: null, name: projectName }, ...trail];
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label={t.folders.nav} className="text-sm">
        <ol className="flex flex-wrap items-center gap-1">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={crumb.id ?? "root"} className="flex items-center gap-1">
                {index > 0 && <span aria-hidden className="text-neutral-400">/</span>}
                {last ? (
                  <span aria-current="page" className="font-medium">
                    {crumb.name}
                  </span>
                ) : (
                  <Link href={listHref(projectId, params, { folder: crumb.id })} className="text-neutral-500 hover:underline">
                    {crumb.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {(subfolders.length > 0 || canEdit) && (
        <div className="flex flex-wrap items-center gap-2">
          {subfolders.map((folder) => (
            <Link
              key={folder.id}
              href={listHref(projectId, params, { folder: folder.id })}
              className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            >
              <span aria-hidden>📁</span>
              {folder.name}
            </Link>
          ))}
          {canEdit && <CreateFolderForm projectId={projectId} parentId={params.folder} />}
        </div>
      )}
    </div>
  );
}
