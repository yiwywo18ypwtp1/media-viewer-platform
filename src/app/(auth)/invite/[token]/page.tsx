import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { getCurrentUser } from "@/features/auth/session";
import { acceptInvitation } from "@/features/workspaces/actions";
import { getPendingInvitation } from "@/features/workspaces/queries";
import { ROLE_LABELS } from "@/features/workspaces/roles";

// Public page (see proxy.ts): someone without an account must be able to see
// the invitation, then sign up and come back here via ?next=.
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([getPendingInvitation(token), getCurrentUser()]);

  if (!invitation) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Invitation not available</h1>
        <p className="text-sm text-neutral-500">
          This link was already used, revoked, or is older than 7 days. Ask for a new invitation.
        </p>
        <Link href="/" className="text-sm underline">
          Go to Media Review Hub
        </Link>
      </>
    );
  }

  const here = `/invite/${token}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">Join {invitation.workspaceName}</h1>
      <p className="text-sm text-neutral-500">
        {invitation.inviterName} invited <strong>{invitation.email}</strong> as{" "}
        {ROLE_LABELS[invitation.role].toLowerCase()}.
      </p>

      {!user && (
        <div className="flex flex-col gap-2 text-sm">
          <Link
            href={`/register?next=${encodeURIComponent(here)}`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-center font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Create an account
          </Link>
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="text-center underline">
            I already have an account
          </Link>
        </div>
      )}

      {user && user.email === invitation.email && (
        <form action={acceptInvitation.bind(null, token)}>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Accept invitation
          </button>
        </form>
      )}

      {user && user.email !== invitation.email && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            You&apos;re signed in as <strong>{user.email}</strong>. This invitation is for{" "}
            <strong>{invitation.email}</strong>.
          </p>
          <form action={logout.bind(null, here)}>
            <button type="submit" className="underline">
              Sign out and use the invited account
            </button>
          </form>
        </div>
      )}
    </>
  );
}
