DO $$ BEGIN
 CREATE TYPE "public"."storybook_status" AS ENUM('draft', 'published');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 CREATE TYPE "public"."page_side" AS ENUM('left', 'right');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "assets" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "storage_key" text NOT NULL,
 "mime_type" text NOT NULL,
 "bytes" integer NOT NULL,
 "width" integer,
 "height" integer,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "storybooks" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "slug" text NOT NULL,
 "title" text NOT NULL,
 "summary" text,
 "cover_asset_id" uuid,
 "status" "storybook_status" DEFAULT 'draft' NOT NULL,
 "theme" jsonb,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "pages" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "storybook_id" uuid NOT NULL,
 "position" integer NOT NULL,
 "side" "page_side" NOT NULL,
 "content" jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "viewers" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "email" text NOT NULL,
 "otp_hash" text,
 "otp_expires" timestamp with time zone,
 "verified_at" timestamp with time zone,
 "opted_out" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "view_events" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "viewer_id" uuid NOT NULL,
 "storybook_id" uuid NOT NULL,
 "opened_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "pages" ADD CONSTRAINT "pages_storybook_id_storybooks_id_fk" FOREIGN KEY ("storybook_id") REFERENCES "public"."storybooks"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "view_events" ADD CONSTRAINT "view_events_viewer_id_viewers_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."viewers"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "view_events" ADD CONSTRAINT "view_events_storybook_id_storybooks_id_fk" FOREIGN KEY ("storybook_id") REFERENCES "public"."storybooks"("id") ON DELETE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "storybooks_slug_idx" ON "storybooks" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "storybooks_status_idx" ON "storybooks" USING btree ("status");
CREATE INDEX IF NOT EXISTS "pages_book_position_idx" ON "pages" USING btree ("storybook_id","position");
CREATE UNIQUE INDEX IF NOT EXISTS "viewers_email_idx" ON "viewers" USING btree ("email");
CREATE INDEX IF NOT EXISTS "view_events_book_idx" ON "view_events" USING btree ("storybook_id");
CREATE INDEX IF NOT EXISTS "view_events_viewer_idx" ON "view_events" USING btree ("viewer_id");
