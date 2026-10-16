import { z } from "zod";
import { checkRange, commentFieldsSchema } from "@/features/comments/schema";

// Shared by the share link form, POST /api/share-links and the guest page.

export const createShareLinkSchema = z.object({
  assetId: z.uuid(),
  // null = always the latest version.
  versionId: z.uuid().nullable(),
  // An instant; the form converts the creator's local time (as the review wizard does).
  expiresAt: z.iso
    .datetime({ offset: true })
    .nullable()
    .refine((value) => value === null || new Date(value).getTime() > Date.now(), "Pick a time in the future."),
  // null = no password.
  password: z.string().min(6, "Use at least 6 characters.").max(200).nullable(),
  allowDownload: z.boolean(),
  allowComments: z.boolean(),
});

export const unlockSchema = z.object({
  password: z.string().min(1, "Enter the password.").max(200),
});

export const guestNameSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(80, "Keep it under 80 characters."),
});

// A guest comment: the member comment fields without mentions (guests can't
// see the member list), plus the name they gave.
export const guestCommentSchema = commentFieldsSchema
  .omit({ mentions: true })
  .extend({ guestName: guestNameSchema.shape.name })
  .superRefine(checkRange);

export type ShareLinkSummary = {
  id: string;
  versionNumber: number | null; // null = latest
  expiresAt: string | null;
  hasPassword: boolean;
  allowDownload: boolean;
  allowComments: boolean;
  state: "active" | "revoked" | "expired";
  createdAt: string;
  createdBy: string;
};
