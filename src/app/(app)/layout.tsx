import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { requireUser } from "@/features/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <header className="border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="font-semibold">
            Media Review Hub
          </Link>
          <div className="flex items-center gap-4 text-sm">
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
