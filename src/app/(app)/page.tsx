import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { CreateWorkspaceForm } from "@/features/workspaces/components/create-workspace-form";
import { listWorkspacesWithProjects } from "@/features/workspaces/queries";
import { getI18n } from "@/i18n/server";

export default async function HomePage() {
  const user = await requireUser();
  const workspaces = await listWorkspacesWithProjects(user.id);
  const { t } = await getI18n();

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">{t.home.title}</h1>

      {workspaces.length === 0 && (
        <p className="text-neutral-500">{t.home.empty}</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {workspaces.map((workspace) => (
          <li key={workspace.id} className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/w/${workspace.id}`} className="font-semibold hover:underline">
                {workspace.name}
              </Link>
              <span className="text-xs text-neutral-500">{t.roles[workspace.role]}</span>
            </div>
            {workspace.projects.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">{t.home.noProjects}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {workspace.projects.map((project) => (
                  <li key={project.id}>
                    <Link href={`/p/${project.id}`} className="hover:underline">
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <CreateWorkspaceForm />
    </div>
  );
}
