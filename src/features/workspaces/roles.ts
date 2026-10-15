// The permission model in one place. Pure (no server imports): the server uses
// it to enforce access, the UI uses the same table to hide what you can't do.

export const ROLES = ["owner", "editor", "reviewer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

// Roles are strictly ordered: each one can do everything the ones below can.
const RANK: Record<Role, number> = { viewer: 0, reviewer: 1, editor: 2, owner: 3 };

// Minimum role per action.
const MIN_ROLE = {
  viewProject: "viewer",
  comment: "reviewer",
  decideReview: "reviewer",
  createProject: "editor",
  upload: "editor",
  requestReview: "editor",
  manageMembers: "owner",
} as const satisfies Record<string, Role>;

export type Action = keyof typeof MIN_ROLE;

export function can(role: Role, action: Action): boolean {
  return RANK[role] >= RANK[MIN_ROLE[action]];
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};
