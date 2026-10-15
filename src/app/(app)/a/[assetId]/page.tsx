import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { StatusBadge } from "@/features/assets/components/badges";
import { getAssetAccess, listVersions } from "@/features/assets/queries";
import { Player } from "@/features/player/components/player";
import { getPlaybackUrls } from "@/features/player/playback";
import { ProcessingBadge } from "@/features/processing/components/processing-badge";
import { ProjectEvents } from "@/features/processing/components/project-events";
import { can } from "@/features/workspaces/roles";
import { formatBytes, formatDuration } from "@/lib/format";

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function AssetPage({ params, searchParams }: PageProps<"/a/[assetId]">) {
  const user = await requireUser();
  const access = await getAssetAccess(user.id, (await params).assetId);
  if (!access) notFound();

  const { asset, project, workspace } = access;
  const versions = await listVersions(asset.id);
  // The selected version lives in the URL (?v=2), defaulting to the latest.
  const requested = Number((await searchParams).v);
  const version = versions.find((v) => v.number === requested) ?? versions[0];
  const urls = version.processingState === "ready" ? await getPlaybackUrls(asset.id, version.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-500">
            <Link href={`/w/${workspace.id}`} className="hover:underline">
              {workspace.name}
            </Link>
            {" / "}
            <Link href={`/p/${project.id}`} className="hover:underline">
              {project.name}
            </Link>
          </p>
          <h1 className="flex items-center gap-3 text-2xl font-semibold">
            {asset.name}
            <StatusBadge status={asset.status} />
          </h1>
        </div>
        <nav aria-label="Versions" className="flex flex-wrap gap-1 text-sm">
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
        </nav>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <ProjectEvents projectId={project.id}>
          {urls?.videoUrl ? (
            // key: switching versions mounts a fresh player (new element, new state).
            <Player
              key={version.id}
              assetId={asset.id}
              versionId={version.id}
              initialUrls={urls}
              fps={version.fps}
              durationMs={version.durationMs ?? 0}
            />
          ) : urls?.imageUrl ? (
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
                initial={{
                  state: version.processingState,
                  progress: version.processingProgress,
                  error: version.processingError,
                }}
                canRetry={can(access.role, "upload")}
              />
            </div>
          )}
        </ProjectEvents>

        <aside className="flex flex-col gap-6 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-neutral-500">Version</dt>
            <dd>v{version.number}</dd>
            <dt className="text-neutral-500">Uploaded</dt>
            <dd>
              {dateFormat.format(version.createdAt)} by {version.uploadedBy}
            </dd>
            <dt className="text-neutral-500">Original</dt>
            <dd>
              {formatBytes(version.size)} · {version.mime}
            </dd>
            {version.width && version.height && (
              <>
                <dt className="text-neutral-500">Resolution</dt>
                <dd>
                  {version.width}×{version.height}
                </dd>
              </>
            )}
            {version.durationMs !== null && (
              <>
                <dt className="text-neutral-500">Duration</dt>
                <dd>{formatDuration(Math.round(version.durationMs / 1000))}</dd>
              </>
            )}
            {version.fps !== null && (
              <>
                <dt className="text-neutral-500">Frame rate</dt>
                <dd>{version.fps.toFixed(3)} fps</dd>
              </>
            )}
          </dl>
          <p className="text-neutral-500">Comments come in the next phase.</p>
        </aside>
      </div>
    </div>
  );
}
