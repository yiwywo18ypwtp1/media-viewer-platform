import { ASSET_STATUS_LABELS, type AssetStatus } from "../labels";

const STATUS_STYLES: Record<AssetStatus, string> = {
  in_review: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  changes_requested: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
};

export function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}
