CREATE TYPE "public"."review_decision" AS ENUM('approve', 'request_changes');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('active', 'approved', 'changes_requested', 'stale');--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"step" integer NOT NULL,
	"decision" "review_decision" NOT NULL,
	"note" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_decisions_one_per_step" UNIQUE("request_id","user_id","step"),
	CONSTRAINT "review_decisions_idempotency" UNIQUE("request_id","user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"message" text,
	"steps" jsonb NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" "review_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_request_id_review_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_version_id_asset_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_requests_asset_id_idx" ON "review_requests" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_requests_one_active_per_asset" ON "review_requests" USING btree ("asset_id") WHERE status = 'active';