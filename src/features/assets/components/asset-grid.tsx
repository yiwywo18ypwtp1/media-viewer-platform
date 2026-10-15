import Image from "next/image";
import Link from "next/link";
import { formatDuration } from "@/lib/format";
import type { AssetListItem } from "../queries";
import { ProcessingBadge, StatusBadge } from "./badges";
import { NewVersionButton } from "./new-version-button";

type Props = { projectId: string; assets: AssetListItem[]; canUpload: boolean };

export function AssetGrid({ projectId, assets, canUpload }: Props) {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => (
        <li key={asset.id} className="flex flex-col gap-2">
          <Link
            href={`/a/${asset.id}`}
            className="relative block aspect-video overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-900"
          >
            {asset.posterUrl ? (
              <Image src={asset.posterUrl} alt="" fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-xs uppercase text-neutral-400">
                {asset.kind}
              </span>
            )}
            {asset.latest.durationMs !== null && (
              <span className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white tabular-nums">
                {formatDuration(Math.round(asset.latest.durationMs / 1000))}
              </span>
            )}
          </Link>
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <Link href={`/a/${asset.id}`} className="truncate font-medium hover:underline" title={asset.name}>
                {asset.name}
              </Link>
              <span className="shrink-0 text-xs text-neutral-500">v{asset.latest.number}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={asset.status} />
              <ProcessingBadge
                state={asset.latest.processingState}
                progress={asset.latest.processingProgress}
                error={asset.latest.processingError}
              />
            </div>
            {canUpload && <NewVersionButton projectId={projectId} assetId={asset.id} kind={asset.kind} />}
          </div>
        </li>
      ))}
    </ul>
  );
}
