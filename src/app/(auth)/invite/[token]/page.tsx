import Link from "next/link";
import { getI18n } from "@/i18n/server";
import { logout } from "@/features/auth/actions";
import { getCurrentUser } from "@/features/auth/session";
import { acceptInvitation } from "@/features/workspaces/actions";
import { getPendingInvitation } from "@/features/workspaces/queries";

// Public page (see proxy.ts): someone without an account must be able to see
// the invitation, then sign up and come back here via ?next=.
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { t } = await getI18n();
  const { token } = await params;
  const [invitation, user] = await Promise.all([getPendingInvitation(token), getCurrentUser()]);

  if (!invitation) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t.invite.unavailable}</h1>
        <p className="text-sm text-neutral-500">{t.invite.unavailableText}</p>
        <Link href="/" className="text-sm underline">
          {t.invite.goHome}
        </Link>
      </>
    );
  }

  const here = `/invite/${token}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.invite.join(invitation.workspaceName)}</h1>
      <p className="text-sm text-neutral-500">
        {t.invite.invited(invitation.inviterName, t.roles[invitation.role].toLowerCase())} <strong>{invitation.email}</strong>
      </p>

      {!user && (
        <div className="flex flex-col gap-2 text-sm">
          <Link
            href={`/register?next=${encodeURIComponent(here)}`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-center font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t.auth.createAccount}
          </Link>
          <Link href={`/login?next=${encodeURIComponent(here)}`} className="text-center underline">
            {t.invite.haveAccount}
          </Link>
        </div>
      )}

      {user && user.email === invitation.email && (
        <form action={acceptInvitation.bind(null, token)}>
          <button
            type="submit"
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {t.invite.accept}
          </button>
        </form>
      )}

      {user && user.email !== invitation.email && (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            {t.invite.signedInAs} <strong>{user.email}</strong>. {t.invite.invitationFor} <strong>{invitation.email}</strong>.
          </p>
          <form action={logout.bind(null, here)}>
            <button type="submit" className="underline">
              {t.invite.switchAccount}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
