CREATE TYPE "public"."page_side" AS ENUM('left', 'right');--> statement-breakpoint
CREATE TYPE "public"."storybook_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storybook_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"side" "page_side" NOT NULL,
	"content" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storybooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"cover_asset_id" text,
	"status" "storybook_status" DEFAULT 'draft' NOT NULL,
	"theme" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "view_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"viewer_id" uuid NOT NULL,
	"storybook_id" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "viewers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"otp_hash" text,
	"otp_expires" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"opted_out" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_storybook_id_storybooks_id_fk" FOREIGN KEY ("storybook_id") REFERENCES "public"."storybooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storybooks" ADD CONSTRAINT "storybooks_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_viewer_id_viewers_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."viewers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_storybook_id_storybooks_id_fk" FOREIGN KEY ("storybook_id") REFERENCES "public"."storybooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pages_book_position_idx" ON "pages" USING btree ("storybook_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "storybooks_slug_idx" ON "storybooks" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "storybooks_status_idx" ON "storybooks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "view_events_book_idx" ON "view_events" USING btree ("storybook_id");--> statement-breakpoint
CREATE INDEX "view_events_viewer_idx" ON "view_events" USING btree ("viewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "viewers_email_idx" ON "viewers" USING btree ("email");