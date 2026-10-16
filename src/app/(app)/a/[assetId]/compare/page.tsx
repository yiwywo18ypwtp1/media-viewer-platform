import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/features/auth/session";
import { getAssetAccess, listVersions, type AssetVersion } from "@/features/assets/queries";
import { listComments } from "@/features/comments/server";
import { CompareView, type CompareSide } from "@/features/compare/components/compare-view";
import { pickVersions } from "@/features/compare/sync";
import { getPlaybackUrls } from "@/features/player/playback";
import { listMembers } from "@/features/workspaces/queries";

export default async function ComparePage({ params, searchParams }: PageProps<"/a/[assetId]/compare">) {
  const user = await requireUser();
  const access = await getAssetAccess(user.id, (await params).assetId);
  if (!access) notFound();
  const { asset, workspace } = access;

  // Only processed versions can be played side by side.
  const versions = (await listVersions(asset.id)).filter((v) => v.processingState === "ready");
  const query = await searchParams;
  const picked = pickVersions(versions, query.a, query.b);
  const back = (
    <Link href={`/a/${asset.id}`} className="text-sm text-neutral-500 hover:underline">
      ← {asset.name}
    </Link>
  );
  if (!picked) {
    return (
      <div className="flex flex-col gap-3">
        {back}
        <p className="text-sm text-neutral-500">Comparing needs two processed versions of this asset.</p>
      </div>
    );
  }

  const side = async (version: AssetVersion): Promise<CompareSide> => {
    const [urls, page] = await Promise.all([getPlaybackUrls(asset.id, version.id), listComments(version.id, null)]);
    return { number: version.number, urls: urls!, fps: version.fps, durationMs: version.durationMs ?? 0, comments: page.comments };
  };
  const [left, right, members] = await Promise.all([side(picked.left), side(picked.right), listMembers(workspace.id)]);

  const picker = (param: "a" | "b", current: number, other: number) => (
    <nav aria-label={param === "a" ? "Left version" : "Right version"} className="flex gap-1">
      {versions.map((v) => {
        const next = param === "a" ? { a: v.number, b: other } : { a: other, b: v.number };
        return (
          <Link
            key={v.id}
            href={`/a/${asset.id}/compare?a=${next.a}&b=${next.b}`}
            aria-current={v.number === current ? "page" : undefined}
            aria-disabled={v.number === other || undefined}
            className={`rounded px-2 py-1 ${
              v.number === current
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : v.number === other
                  ? "pointer-events-none text-neutral-300 dark:text-neutral-700"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            }`}
          >
            v{v.number}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          {back}
          <h1 className="text-2xl font-semibold">Compare versions</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {picker("a", picked.left.number, picked.right.number)}
          <span className="text-neutral-500">vs</span>
          {picker("b", picked.right.number, picked.left.number)}
        </div>
      </div>
      <CompareView
        // New versions = new players.
        key={`${left.number}-${right.number}`}
        kind={asset.kind}
        left={left}
        right={right}
        members={members.map((m) => ({ id: m.userId, name: m.name }))}
      />
    </div>
  );
}
