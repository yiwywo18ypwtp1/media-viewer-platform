import { z } from "zod";

// Shared by the folder forms, the folder actions and the upload API (a dropped
// folder's path arrives as a list of names).

export const MAX_FOLDER_DEPTH = 10;

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, "Give the folder a name.")
  .max(100, "Keep it under 100 characters.")
  .refine((name) => !name.includes("/") && name !== "." && name !== "..", "Folder names can't contain “/”.");

export const createFolderSchema = z.object({
  projectId: z.uuid(),
  parentId: z.uuid().nullable(),
  name: folderNameSchema,
});

export const moveAssetSchema = z.object({
  assetId: z.uuid(),
  // null = top level of the project.
  folderId: z.uuid().nullable(),
});

// "Shots/Day 1/clip.mp4" -> ["Shots", "Day 1"]: the folders a dropped file
// sat in, relative to what was dropped.
export function folderPathOf(relativePath: string): string[] {
  return relativePath.split("/").filter(Boolean).slice(0, -1);
}
