import { z } from "zod";
import { emailField } from "@/features/auth/schema";
import { ROLES } from "./roles";

const name = z.string().trim().min(1, "Enter a name.").max(100, "Use at most 100 characters.");

export const createWorkspaceSchema = z.object({ name });

export const createProjectSchema = z.object({
  workspaceId: z.uuid(),
  name,
});

export const inviteMemberSchema = z.object({
  workspaceId: z.uuid(),
  email: emailField,
  role: z.enum(ROLES, "Choose a role."),
});
