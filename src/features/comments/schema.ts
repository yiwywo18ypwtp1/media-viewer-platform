import { z } from "zod";
import { annotationSchema, type Shape } from "@/features/annotations/schema";

// Shared by the comment form (zodResolver) and the comment API routes.

export const MAX_COMMENT_LENGTH = 5000;

const body = z
  .string()
  .trim()
  .min(1, "Write something first.")
  .max(MAX_COMMENT_LENGTH, `Keep it under ${MAX_COMMENT_LENGTH} characters.`);

export const createCommentSchema = z.object({
  // Client-generated, so an optimistic comment keeps its id once saved.
  id: z.uuid(),
  body,
  timecodeMs: z.number().int().min(0).nullable(),
  // Part of the form value: the drawing travels with the comment. Optional in
  // the API (defaults to none), so clients that don't draw needn't send it.
  annotation: annotationSchema.nullable().default(null),
  parentId: z.uuid().nullable(),
  mentions: z.array(z.uuid()).max(50),
});

export const editCommentSchema = z.object({
  body,
  mentions: z.array(z.uuid()).max(50),
});

// PATCH /api/comments/:id is either an edit or a resolve/reopen.
export const updateCommentSchema = z.union([editCommentSchema, z.object({ resolved: z.boolean() })]);

export type CommentDto = {
  id: string;
  versionId: string;
  parentId: string | null;
  author: { id: string; name: string };
  body: string;
  timecodeMs: number | null;
  annotation: Shape[] | null;
  mentions: string[];
  resolvedAt: string | null;
  createdAt: string;
  editedAt: string | null;
  revision: number;
  replies: CommentDto[];
};

export type CommentPage = { comments: CommentDto[]; nextCursor: string | null };

export type Member = { id: string; name: string };

// A mention counts only while "@Name" is still in the text: deleting the text
// drops the mention. Used by the form and re-applied on the server.
export function keepMentionsInBody(body: string, mentionIds: string[], members: Member[]): string[] {
  return [...new Set(mentionIds)].filter((id) => {
    const member = members.find((m) => m.id === id);
    return member !== undefined && body.includes(`@${member.name}`);
  });
}
