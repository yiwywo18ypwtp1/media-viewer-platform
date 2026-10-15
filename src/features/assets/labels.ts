export const ASSET_STATUS_LABELS = {
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
} as const;

export const STATUS_FILTER_LABELS = { all: "All", ...ASSET_STATUS_LABELS } as const;

export type AssetStatus = keyof typeof ASSET_STATUS_LABELS;
export type ProcessingState = "pending" | "running" | "ready" | "failed";
