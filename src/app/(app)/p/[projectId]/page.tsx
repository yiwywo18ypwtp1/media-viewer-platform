import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { Uploader } from "@/features/uploads/components/uploader";
import { getProjectAccess } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";

export default async function ProjectPage({ params }: PageProps<"/p/[projectId]">) {
  const user = await requireUser();
  const access = await getProjectAccess(user.id, (await params).projectId);
  if (!access) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/w/${access.workspace.id}`} className="text-sm text-neutral-500 hover:underline">
          {access.workspace.name}
        </Link>
        <h1 className="text-2xl font-semibold">{access.project.name}</h1>
      </div>
      {/* Hidden for viewers/reviewers; the upload API checks the role regardless. */}
      {can(access.role, "upload") && <Uploader projectId={access.project.id} />}
      <p className="text-neutral-500">The asset list comes in the next phase.</p>
    </div>
  );
}
