CREATE TYPE "public"."asset_kind" AS ENUM('video', 'image');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('in_review', 'changes_requested', 'approved');--> statement-breakpoint
CREATE TYPE "public"."processing_state" AS ENUM('pending', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('uploading', 'completed', 'aborted');--> statement-breakpoint
CREATE TABLE "asset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"original_key" text NOT NULL,
	"original_size" bigint NOT NULL,
	"original_mime" text NOT NULL,
	"original_checksum" text NOT NULL,
	"processing_state" "processing_state" DEFAULT 'pending' NOT NULL,
	"processing_progress" integer DEFAULT 0 NOT NULL,
	"processing_error" text,
	"processing_attempts" integer DEFAULT 0 NOT NULL,
	"poster_key" text,
	"mp4_key" text,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"fps" real,
	CONSTRAINT "asset_versions_asset_number_unique" UNIQUE("asset_id","number")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"status" "asset_status" DEFAULT 'in_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"asset_id" uuid,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"size" bigint NOT NULL,
	"mime_type" text NOT NULL,
	"s3_key" text NOT NULL,
	"s3_upload_id" text NOT NULL,
	"part_size" integer NOT NULL,
	"status" "upload_status" DEFAULT 'uploading' NOT NULL,
	"version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_project_id_idx" ON "assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "uploads_status_created_at_idx" ON "uploads" USING btree ("status","created_at");