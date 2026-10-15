import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { requireUser } from "@/features/auth/session";
import { listInbox } from "@/features/reviews/server";

// Reviews waiting for the current user's decision.
export default async function InboxPage() {
  const user = await requireUser();
  const items = await listInbox(user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      {items.length === 0 ? (
        <p className="text-neutral-500">Nothing waiting for your review.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <Link href={`/a/${item.assetId}?v=${item.versionNumber}`} className="font-medium hover:underline">
                  {item.assetName} v{item.versionNumber}
                </Link>
                <span className="text-neutral-500">
                  {item.projectName} · requested by {item.requestedBy}
                </span>
                {item.message && <span className="line-clamp-2">{item.message}</span>}
              </div>
              <span className="text-neutral-500">
                {item.dueAt ? (
                  <>
                    Due <LocalTime value={item.dueAt} />
                  </>
                ) : (
                  "No due date"
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
