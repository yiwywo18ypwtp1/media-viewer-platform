import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/features/auth/session";
import { listInbox } from "@/features/reviews/server";
import { getI18n } from "@/i18n/server";

// Reviews waiting for the current user's decision.
export default async function InboxPage() {
  const user = await requireUser();
  const items = await listInbox(user.id);
  const { t } = await getI18n();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t.inbox.title}</h1>
      {items.length === 0 ? (
        <p className="text-neutral-500">{t.inbox.empty}</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <Link href={`/a/${item.assetId}?v=${item.versionNumber}`} className="font-medium hover:underline">
                  {item.assetName} v{item.versionNumber}
                </Link>
                <span className="text-neutral-500">
                  {item.projectName} · {t.inbox.requestedBy(item.requestedBy)}
                </span>
                {item.message && <span className="line-clamp-2">{item.message}</span>}
              </div>
              <span className="text-neutral-500">
                {item.dueAt ? (
                  <>
                    {t.inbox.due} <LocalTime value={item.dueAt} />
                  </>
                ) : (
                  t.inbox.noDue
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
