import { removeMember, revokeInvitation } from "../actions";
import { ROLE_LABELS, type Role } from "../roles";
import { InviteMemberForm } from "./invite-member-form";

type Props = {
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
  members: { userId: string; name: string; email: string; role: Role }[];
  invitations: { id: string; email: string; role: Role; expiresAt: Date }[];
};

// Server Component. The remove/revoke buttons are plain forms posting to Server
// Actions with bound arguments, so they need no client JS. Hiding them for
// non-owners is only UX: the actions check the role again on the server.
export function MembersSection({ workspaceId, currentUserId, canManage, members, invitations }: Props) {
  const ownerCount = members.filter((member) => member.role === "owner").length;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Members</h2>
      <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {members.map((member) => {
          const isLastOwner = member.role === "owner" && ownerCount === 1;
          return (
            <li key={member.userId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">
                  {member.name}
                  {member.userId === currentUserId && <span className="text-neutral-500"> (you)</span>}
                </p>
                <p className="text-neutral-500">{member.email}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-neutral-500">{ROLE_LABELS[member.role]}</span>
                {canManage && !isLastOwner && (
                  <form action={removeMember.bind(null, workspaceId, member.userId)}>
                    <button type="submit" className="text-red-600 underline">
                      Remove
                    </button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && (
        <>
          <InviteMemberForm workspaceId={workspaceId} />
          {invitations.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-neutral-500">Pending invitations</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center justify-between gap-4">
                    <span>
                      {invitation.email} · {ROLE_LABELS[invitation.role]} · expires{" "}
                      {invitation.expiresAt.toLocaleDateString("en-GB")}
                    </span>
                    <form action={revokeInvitation.bind(null, workspaceId, invitation.id)}>
                      <button type="submit" className="underline">
                        Revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
