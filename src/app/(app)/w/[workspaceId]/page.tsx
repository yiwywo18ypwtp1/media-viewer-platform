import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { CreateProjectForm } from "@/features/workspaces/components/create-project-form";
import { MembersSection } from "@/features/workspaces/components/members-section";
import {
  getWorkspaceAccess,
  listMembers,
  listPendingInvitations,
  listProjects,
} from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";

export default async function WorkspacePage({ params }: PageProps<"/w/[workspaceId]">) {
  const user = await requireUser();
  const access = await getWorkspaceAccess(user.id, (await params).workspaceId);
  if (!access) notFound();

  const { workspace, role } = access;
  const canManage = can(role, "manageMembers");
  const [projects, members, invitations] = await Promise.all([
    listProjects(workspace.id),
    listMembers(workspace.id),
    canManage ? listPendingInvitations(workspace.id) : [],
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          Workspaces
        </Link>
        <h1 className="text-2xl font-semibold">{workspace.name}</h1>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Projects</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-neutral-500">No projects yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/p/${project.id}`}
                  className="block rounded-md border border-neutral-200 px-4 py-3 hover:border-neutral-400 dark:border-neutral-800"
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {can(role, "createProject") && <CreateProjectForm workspaceId={workspace.id} />}
      </section>

      <MembersSection
        workspaceId={workspace.id}
        currentUserId={user.id}
        canManage={canManage}
        members={members}
        invitations={invitations}
      />
    </div>
  );
}
