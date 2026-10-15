import Link from "next/link";
import { formatBytes } from "@/lib/format";
import { sortHref, type ListParams } from "../list-params";
import type { AssetListItem } from "../queries";
import { ProcessingBadge, StatusBadge } from "./badges";
import { NewVersionButton } from "./new-version-button";

type Props = { projectId: string; params: ListParams; assets: AssetListItem[]; canUpload: boolean };

const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

// A plain server-rendered <table>: sorting happens in SQL via the URL, so the
// table itself has no state. (A client table library would add a client
// boundary and bundle size without anything to do.)
export function AssetTable({ projectId, params, assets, canUpload }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500 dark:border-neutral-800">
          <tr>
            <SortableHeader projectId={projectId} params={params} sort="name">
              Name
            </SortableHeader>
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium">Version</th>
            <th className="px-2 py-2 font-medium">Size</th>
            <SortableHeader projectId={projectId} params={params} sort="created">
              Added
            </SortableHeader>
            <SortableHeader projectId={projectId} params={params} sort="updated">
              Updated
            </SortableHeader>
            {canUpload && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {assets.map((asset) => (
            <tr key={asset.id}>
              <td className="px-2 py-2">
                <Link href={`/a/${asset.id}`} className="font-medium hover:underline">
                  {asset.name}
                </Link>
                <span className="ml-2 text-xs uppercase text-neutral-400">{asset.kind}</span>
              </td>
              <td className="px-2 py-2">
                <div className="flex flex-col items-start gap-1">
                  <StatusBadge status={asset.status} />
                  <ProcessingBadge
                    state={asset.latest.processingState}
                    progress={asset.latest.processingProgress}
                    error={asset.latest.processingError}
                  />
                </div>
              </td>
              <td className="px-2 py-2 tabular-nums">v{asset.latest.number}</td>
              <td className="px-2 py-2 tabular-nums">{formatBytes(asset.latest.size)}</td>
              <td className="px-2 py-2 tabular-nums">{dateFormat.format(asset.createdAt)}</td>
              <td className="px-2 py-2 tabular-nums">{dateFormat.format(asset.updatedAt)}</td>
              {canUpload && (
                <td className="px-2 py-2 text-right">
                  <NewVersionButton projectId={projectId} assetId={asset.id} kind={asset.kind} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortableHeader(props: {
  projectId: string;
  params: ListParams;
  sort: ListParams["sort"];
  children: string;
}) {
  const active = props.params.sort === props.sort;
  const ariaSort = active ? (props.params.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th className="px-2 py-2 font-medium" aria-sort={ariaSort}>
      <Link href={sortHref(props.projectId, props.params, props.sort)} scroll={false} className="hover:underline">
        {props.children}
        {active && <span aria-hidden="true">{props.params.dir === "asc" ? " ↑" : " ↓"}</span>}
      </Link>
    </th>
  );
}
