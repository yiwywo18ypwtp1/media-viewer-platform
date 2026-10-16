// Drizzle table definitions. Tables are added per feature, each with its own migration.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Shape } from "../features/annotations/schema";
import type { SpriteInfo } from "../features/player/sprite";
import type { Step } from "../features/reviews/rules";
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

// A folder tree inside a project. parent_id null = top level. Names are unique
// among siblings (NULLS NOT DISTINCT: also at the top level), which is what
// lets a dropped folder find or create "the same" folder on the next upload.
export const folders = pgTable(
  "folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique("folders_sibling_name").on(table.projectId, table.parentId, table.name).nullsNotDistinct()],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // null = top level of the project.
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: assetKind("kind").notNull(),
    status: assetStatus("status").notNull().default("in_review"),
    createdAt: createdAt(),
    // Bumped when a new version lands; the asset list sorts by it.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("assets_project_id_idx").on(table.projectId), index("assets_folder_id_idx").on(table.folderId)],
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

    // Renditions written by the worker under versions/<id>/. Video: poster + 720p MP4.
    // Image: posterKey is a small WebP thumbnail, previewKey a large WebP for viewing.
    posterKey: text("poster_key"),
    mp4Key: text("mp4_key"),
    previewKey: text("preview_key"),
    // Video: master playlist of the HLS renditions (720p + 360p).
    hlsKey: text("hls_key"),
    // Video: scrubbing thumbnails in one JPEG, with the grid geometry.
    sprite: jsonb("sprite").$type<SpriteInfo & { key: string }>(),

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
    // Where a new asset lands (resolved from the dropped folder path at create).
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
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

// --- Comments ---

export const comments = pgTable(
  "comments",
  {
    // Generated by the browser for optimistic comments (validated as a UUID),
    // so the optimistic copy, the API response and the realtime echo share one id.
    id: uuid("id").primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => assetVersions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Replies are one level deep: parent is always a top-level comment.
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    // Video time the comment points at (frame middle, see player/timecode.ts).
    timecodeMs: integer("timecode_ms"),
    // Optional end of a range starting at timecode_ms (frame middle as well).
    rangeEndMs: integer("range_end_ms"),
    // Drawing over that frame: normalized shapes (see features/annotations).
    annotation: jsonb("annotation").$type<Shape[]>(),
    mentionedUserIds: uuid("mentioned_user_ids").array().notNull().default(sql`'{}'::uuid[]`),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Millisecond precision so the pagination cursor round-trips through JS Date exactly.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Bumped on every change; sent as the ETag, checked via If-Match.
    revision: integer("revision").notNull().default(1),
  },
  (table) => [
    index("comments_version_created_idx").on(table.versionId, table.createdAt, table.id),
    index("comments_parent_id_idx").on(table.parentId),
    // The API checks this too; the database has the last word.
    check(
      "comments_range_after_start",
      sql`${table.rangeEndMs} is null or (${table.timecodeMs} is not null and ${table.rangeEndMs} > ${table.timecodeMs})`,
    ),
  ],
);

// --- Review requests ---

export const reviewStatus = pgEnum("review_status", ["active", "approved", "changes_requested", "stale"]);
export const reviewDecision = pgEnum("review_decision", ["approve", "request_changes"]);

export const reviewRequests = pgTable(
  "review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => assetVersions.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    message: text("message"),
    // Sequential steps, each with its reviewers and rule (all / any / atLeast N).
    steps: jsonb("steps").$type<Step[]>().notNull(),
    currentStep: integer("current_step").notNull().default(0),
    status: reviewStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("review_requests_asset_id_idx").on(table.assetId),
    // At most one active review per asset, enforced by the database.
    uniqueIndex("review_requests_one_active_per_asset").on(table.assetId).where(sql`status = 'active'`),
  ],
);

export const reviewDecisions = pgTable(
  "review_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => reviewRequests.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    decision: reviewDecision("decision").notNull(),
    note: text("note"),
    // From the Idempotency-Key header: a retried request finds its decision here.
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    unique("review_decisions_one_per_step").on(table.requestId, table.userId, table.step),
    unique("review_decisions_idempotency").on(table.requestId, table.userId, table.idempotencyKey),
  ],
);
