import { z } from "zod";

// The asset list's view, sort and filter live in the URL (?view=table&sort=name...).
// The URL is the single source of truth: shareable, survives reload, and the
// back button works. These helpers read it safely and build links that change it.

export const VIEWS = ["grid", "table"] as const;
export const SORTS = ["updated", "created", "name"] as const;
export const STATUS_FILTERS = ["all", "in_review", "changes_requested", "approved"] as const;

export type ListParams = {
  view: (typeof VIEWS)[number];
  sort: (typeof SORTS)[number];
  dir: "asc" | "desc";
  status: (typeof STATUS_FILTERS)[number];
};

// Newest first for dates, A→Z for names.
const DEFAULT_DIR: Record<ListParams["sort"], ListParams["dir"]> = {
  updated: "desc",
  created: "desc",
  name: "asc",
};

// .catch(): a hand-edited or stale URL falls back to defaults instead of erroring.
const schema = z.object({
  view: z.enum(VIEWS).catch("grid"),
  sort: z.enum(SORTS).catch("updated"),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  status: z.enum(STATUS_FILTERS).catch("all"),
});

type SearchParams = Record<string, string | string[] | undefined>;

export function parseListParams(searchParams: SearchParams): ListParams {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const raw = schema.parse({
    view: first(searchParams.view),
    sort: first(searchParams.sort),
    dir: first(searchParams.dir),
    status: first(searchParams.status),
  });
  return { ...raw, dir: raw.dir ?? DEFAULT_DIR[raw.sort] };
}

// Link to the same list with some params changed. Defaults are left out, so
// the plain /p/:id URL means "default view".
export function listHref(projectId: string, current: ListParams, change: Partial<ListParams>): string {
  const next = { ...current, ...change };
  // Switching to another sort column starts from that column's natural order.
  if (change.sort && change.sort !== current.sort && !change.dir) next.dir = DEFAULT_DIR[change.sort];

  const query = new URLSearchParams();
  if (next.view !== "grid") query.set("view", next.view);
  if (next.sort !== "updated") query.set("sort", next.sort);
  if (next.dir !== DEFAULT_DIR[next.sort]) query.set("dir", next.dir);
  if (next.status !== "all") query.set("status", next.status);

  const search = query.toString();
  return `/p/${projectId}${search ? `?${search}` : ""}`;
}

// Clicking the active column header flips the direction; another column starts fresh.
export function sortHref(projectId: string, current: ListParams, sort: ListParams["sort"]): string {
  if (sort !== current.sort) return listHref(projectId, current, { sort });
  return listHref(projectId, current, { dir: current.dir === "asc" ? "desc" : "asc" });
}
