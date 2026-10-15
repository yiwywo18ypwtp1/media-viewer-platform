import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";
import { listInbox } from "@/features/reviews/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const waiting = (await listInbox(user.id)).length;

  return (
    <>
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-semibold">
            Media Review Hub
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/inbox" className="hover:underline">
              Inbox
              {waiting > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs text-white" aria-label={`${waiting} waiting`}>
                  {waiting}
                </span>
              )}
            </Link>
            <span className="text-neutral-500">{user.name}</span>
            {/* A plain form posting to the action: works without client JS. */}
            <form action={logout}>
              <button type="submit" className="underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </>
  );
}
