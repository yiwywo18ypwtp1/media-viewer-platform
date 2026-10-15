// Drizzle table definitions. Tables are added per feature, each with its own migration.
import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { ROLES } from "../features/workspaces/roles";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// --- Auth ---

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stored lowercased (normalized by the zod schema), so a plain unique index is enough.
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

// The cookie holds a random token; only its SHA-256 is stored, so a DB leak
// doesn't hand out valid sessions.
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Set when the link is used; a used link can never be used again.
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("password_resets_user_id_idx").on(table.userId)],
);

// --- Workspaces ---

export const workspaceRole = pgEnum("workspace_role", ROLES);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_id_idx").on(table.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("invitations_workspace_id_idx").on(table.workspaceId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [index("projects_workspace_id_idx").on(table.workspaceId)],
);

// --- Assets and uploads ---

export const assetKind = pgEnum("asset_kind", ["video", "image"]);
export const assetStatus = pgEnum("asset_status", ["in_review", "changes_requested", "approved"]);
export const processingState = pgEnum("processing_state", ["pending", "running", "ready", "failed"]);
export const uploadStatus = pgEnum("upload_status", ["uploading", "completed", "aborted"]);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: assetKind("kind").notNull(),
    status: assetStatus("status").notNull().default("in_review"),
    createdAt: createdAt(),
    // Bumped when a new version lands; the asset list sorts by it.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("assets_project_id_idx").on(table.projectId)],
);

// One row per uploaded file: v1, v2, v3... of an asset.
export const assetVersions = pgTable(
  "asset_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),

    originalKey: text("original_key").notNull(),
    // bigint: files go up to 5 GB, past the 2 GB int limit. "number" mode is
    // safe up to 2^53 bytes.
    originalSize: bigint("original_size", { mode: "number" }).notNull(),
    originalMime: text("original_mime").notNull(),
    // SHA-256 computed by the browser; the worker verifies it against the stored file.
    originalChecksum: text("original_checksum").notNull(),

    processingState: processingState("processing_state").notNull().default("pending"),
    processingProgress: integer("processing_progress").notNull().default(0),
    processingError: text("processing_error"),
    processingAttempts: integer("processing_attempts").notNull().default(0),

    posterKey: text("poster_key"),
    mp4Key: text("mp4_key"),

    durationMs: integer("duration_ms"),
    width: integer("width"),
    height: integer("height"),
    fps: real("fps"),
  },
  (table) => [unique("asset_versions_asset_number_unique").on(table.assetId, table.number)],
);

// A multipart upload in progress. Lives from "create" to "complete"/"abort"
// so every presigned-URL request can be checked against it.
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Set when uploading a new version of an existing asset.
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    s3Key: text("s3_key").notNull(),
    s3UploadId: text("s3_upload_id").notNull(),
    partSize: integer("part_size").notNull(),
    status: uploadStatus("status").notNull().default("uploading"),
    // Filled on complete, so a repeated "complete" returns the same version.
    versionId: uuid("version_id").references(() => assetVersions.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("uploads_status_created_at_idx").on(table.status, table.createdAt)],
);
