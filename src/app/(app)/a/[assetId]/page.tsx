import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { StatusBadge } from "@/features/assets/components/badges";
import { getAssetAccess, listVersions } from "@/features/assets/queries";
import { MoveAssetSelect } from "@/features/folders/components/move-asset-select";
import { folderTrail, listFolderPaths } from "@/features/folders/queries";
import { ReviewWorkspace } from "@/features/comments/components/review-workspace";
import { listComments, listMarkers } from "@/features/comments/server";
import { getPlaybackUrls } from "@/features/player/playback";
import { ReviewPanel } from "@/features/reviews/components/review-panel";
import { getLatestReview } from "@/features/reviews/server";
import { ProcessingBadge } from "@/features/processing/components/processing-badge";
import { ProjectEvents } from "@/features/processing/components/project-events";
import { listMembers } from "@/features/workspaces/queries";
import { can } from "@/features/workspaces/roles";
import { formatBytes, formatDuration } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

export default async function AssetPage({ params, searchParams }: PageProps<"/a/[assetId]">) {
  const user = await requireUser();
  const access = await getAssetAccess(user.id, (await params).assetId);
  if (!access) notFound();

  const { asset, project, workspace, role } = access;
  const versions = await listVersions(asset.id);
  // The selected version lives in the URL (?v=2), defaulting to the latest.
  const requested = Number((await searchParams).v);
  const version = versions.find((v) => v.number === requested) ?? versions[0];

  const canEdit = can(role, "upload");
  const [urls, firstPage, markers, members, review, trail, folderPaths] = await Promise.all([
    version.processingState === "ready" ? getPlaybackUrls(asset.id, version.id) : null,
    listComments(version.id, null),
    listMarkers(version.id),
    listMembers(workspace.id),
    getLatestReview(asset.id),
    asset.folderId ? folderTrail(asset.folderId) : [],
    canEdit ? listFolderPaths(project.id) : [],
  ]);

  // Shown instead of the player for images and versions still processing.
  const media = urls?.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- presigned URL, already resized by the worker
    <img
      src={urls.imageUrl}
      alt={asset.name}
      className="max-h-[70vh] w-full rounded-md bg-neutral-100 object-contain dark:bg-neutral-900"
    />
  ) : (
    <div className="flex aspect-video items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-900">
      <ProcessingBadge
        versionId={version.id}
        initial={{ state: version.processingState, progress: version.processingProgress, error: version.processingError }}
        canRetry={canEdit}
      />
    </div>
  );

  const facts = [
    `Uploaded ${dateFormat.format(version.createdAt)} by ${version.uploadedBy}`,
    formatBytes(version.size),
    version.width && version.height ? `${version.width}×${version.height}` : null,
    version.durationMs !== null ? formatDuration(Math.round(version.durationMs / 1000)) : null,
    version.fps !== null ? `${version.fps.toFixed(3)} fps` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-neutral-500">
            <Link href={`/w/${workspace.id}`} className="hover:underline">
              {workspace.name}
            </Link>
            {" / "}
            <Link href={`/p/${project.id}`} className="hover:underline">
              {project.name}
            </Link>
            {trail.map((folder) => (
              <span key={folder.id}>
                {" / "}
                <Link href={`/p/${project.id}?folder=${folder.id}`} className="hover:underline">
                  {folder.name}
                </Link>
              </span>
            ))}
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {asset.name}
            <StatusBadge status={asset.status} />
          </h1>
          <p className="text-xs text-neutral-500">{facts.join(" · ")}</p>
          {canEdit && folderPaths.length > 0 && (
            <MoveAssetSelect assetId={asset.id} folderId={asset.folderId} folders={folderPaths} />
          )}
        </div>
        <nav aria-label="Versions" className="flex flex-wrap items-center gap-1 text-sm">
          {versions.map((v) => (
            <Link
              key={v.id}
              href={`/a/${asset.id}?v=${v.number}`}
              aria-current={v.id === version.id ? "page" : undefined}
              className={`rounded px-2 py-1 ${
                v.id === version.id
                  ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
            >
              v{v.number}
            </Link>
          ))}
          {versions.length > 1 && (
            <Link href={`/a/${asset.id}/compare?b=${version.number}`} className="ml-2 underline">
              Compare
            </Link>
          )}
        </nav>
      </div>

      <ProjectEvents projectId={project.id}>
        <ReviewPanel
          assetId={asset.id}
          review={review}
          currentUserId={user.id}
          canRequest={can(role, "requestReview")}
          versions={versions.map((v) => ({ id: v.id, number: v.number }))}
          selectedVersionId={version.id}
          reviewers={members.filter((m) => can(m.role, "decideReview")).map((m) => ({ id: m.userId, name: m.name }))}
        />
        <ReviewWorkspace
          // A different version is a different review: fresh comment state and player.
          key={version.id}
          assetId={asset.id}
          versionId={version.id}
          video={urls?.videoUrl ? { urls, fps: version.fps, durationMs: version.durationMs ?? 0 } : null}
          media={media}
          initialPage={firstPage}
          initialMarkers={markers}
          members={members.map((m) => ({ id: m.userId, name: m.name }))}
          currentUser={{ id: user.id, name: user.name }}
          canComment={can(role, "comment")}
        />
      </ProjectEvents>
    </div>
  );
}
