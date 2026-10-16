import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { listHref, SORTS, STATUS_FILTERS, VIEWS, type ListParams } from "../list-params";

// Every control is a plain link to a URL with the changed param: no client JS,
// no state to sync. The server renders the list for whatever the URL says.
export async function ListToolbar({ projectId, params }: { projectId: string; params: ListParams }) {
  const { t } = await getI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <nav aria-label={t.assets.filterByStatus} className="flex flex-wrap gap-1">
        {STATUS_FILTERS.map((status) => (
          <ToolbarLink
            key={status}
            href={listHref(projectId, params, { status })}
            active={params.status === status}
          >
            {status === "all" ? t.assets.all : t.assets.status[status]}
          </ToolbarLink>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-4">
        {/* The table sorts by its column headers; the grid needs its own control. */}
        {params.view === "grid" && (
          <nav aria-label={t.assets.sort} className="flex items-center gap-1">
            <span className="text-neutral-500">{t.assets.sortLabel}</span>
            {SORTS.map((sort) => (
              <ToolbarLink key={sort} href={listHref(projectId, params, { sort })} active={params.sort === sort}>
                {t.assets.sorts[sort]}
              </ToolbarLink>
            ))}
          </nav>
        )}
        <nav aria-label={t.assets.view} className="flex gap-1">
          {VIEWS.map((view) => (
            <ToolbarLink key={view} href={listHref(projectId, params, { view })} active={params.view === view}>
              {t.assets.views[view]}
            </ToolbarLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function ToolbarLink(props: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={props.href}
      // Keeps the scroll position: changing a filter shouldn't jump to the top.
      scroll={false}
      aria-current={props.active ? "page" : undefined}
      className={`rounded px-2 py-1 ${
        props.active
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      {props.children}
    </Link>
  );
}
