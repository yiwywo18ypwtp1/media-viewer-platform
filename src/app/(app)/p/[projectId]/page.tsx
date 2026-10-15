import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { AssetGrid } from "@/features/assets/components/asset-grid";
import { AssetTable } from "@/features/assets/components/asset-table";
import { ListToolbar } from "@/features/assets/components/list-toolbar";
import { parseListParams } from "@/features/assets/list-params";
import { listAssets } from "@/features/assets/queries";
import { Uploader } from "@/features/uploads/components/uploader";
import { ProjectEvents } from "@/features/processing/components/project-events";
import { getProjectAccess } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";

export default async function ProjectPage({ params, searchParams }: PageProps<"/p/[projectId]">) {
  const user = await requireUser();
  const access = await getProjectAccess(user.id, (await params).projectId);
  if (!access) notFound();

  const listParams = parseListParams(await searchParams);
  const assets = await listAssets(access.project.id, listParams);
  const canUpload = can(access.role, "upload");
  const projectId = access.project.id;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/w/${access.workspace.id}`} className="text-sm text-neutral-500 hover:underline">
          {access.workspace.name}
        </Link>
        <h1 className="text-2xl font-semibold">{access.project.name}</h1>
      </div>

      {/* Hidden for viewers/reviewers; the upload API checks the role regardless. */}
      {canUpload && <Uploader projectId={projectId} />}

      <ListToolbar projectId={projectId} params={listParams} />

      {/* Live processing progress over SSE; the list itself stays server-rendered. */}
      <ProjectEvents projectId={projectId}>
        {assets.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {listParams.status === "all" ? "No assets yet." : "No assets match this filter."}
          </p>
        ) : listParams.view === "grid" ? (
          <AssetGrid projectId={projectId} assets={assets} canUpload={canUpload} />
        ) : (
          <AssetTable projectId={projectId} params={listParams} assets={assets} canUpload={canUpload} />
        )}
      </ProjectEvents>
    </div>
  );
}
