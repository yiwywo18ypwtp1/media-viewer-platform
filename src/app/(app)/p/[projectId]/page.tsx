import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { getProjectAccess } from "@/features/workspaces/queries";

export default async function ProjectPage({ params }: PageProps<"/p/[projectId]">) {
  const user = await requireUser();
  const access = await getProjectAccess(user.id, (await params).projectId);
  if (!access) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href={`/w/${access.workspace.id}`} className="text-sm text-neutral-500 hover:underline">
          {access.workspace.name}
        </Link>
        <h1 className="text-2xl font-semibold">{access.project.name}</h1>
      </div>
      <p className="text-neutral-500">Assets come in the next phase.</p>
    </div>
  );
}
