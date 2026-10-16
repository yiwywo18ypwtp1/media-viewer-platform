CREATE TYPE "public"."transcript_state" AS ENUM('pending', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "transcript_segments"."text")) STORED
);
--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "transcript_state" "transcript_state";--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "transcript_language" text;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "transcript_key" text;--> statement-breakpoint
ALTER TABLE "asset_versions" ADD COLUMN "transcript_error" text;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcript_segments_version_idx" ON "transcript_segments" USING btree ("version_id","start_ms");--> statement-breakpoint
CREATE INDEX "transcript_segments_search_idx" ON "transcript_segments" USING gin ("search");