/**
 * werbz Stories — Drizzle schema (PostgreSQL)
 * ----------------------------------------------------
 * Path suggestion: src/db/schema.ts
 *
 * Design notes:
 *  - `pages.content` is jsonb holding the `PageContent` union from
 *    storybook-schema.ts. We deliberately do NOT normalize each page
 *    type into its own table — the union is small and presentational,
 *    and jsonb lets you add a 5th page type with zero migrations.
 *  - Media bytes NEVER live in Postgres. `assets` stores a storage key
 *    (R2 / VPS uploads dir) and metadata only.
 *  - `viewers` + `view_events` are your audience-capture + analytics.
 */

import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const storybookStatus = pgEnum("storybook_status", ["draft", "published"]);
export const pageSide = pgEnum("page_side", ["left", "right"]);

/* ── Storybooks ─────────────────────────────────────────────── */
export const storybooks = pgTable(
  "storybooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    coverAssetId: text("cover_asset_id").references(() => assets.id, { onDelete: "set null" }),
    status: storybookStatus("status").notNull().default("draft"),
    theme: jsonb("theme"), // optional per-book Book config (your Copy-config JSON)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: uniqueIndex("storybooks_slug_idx").on(t.slug),
    statusIdx: index("storybooks_status_idx").on(t.status),
  })
);

/* ── Pages ──────────────────────────────────────────────────── */
export const pages = pgTable(
  "pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storybookId: uuid("storybook_id")
      .notNull()
      .references(() => storybooks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // 0-based order
    side: pageSide("side").notNull(),
    content: jsonb("content").notNull(), // <- PageContent union
  },
  (t) => ({
    bookOrderIdx: index("pages_book_position_idx").on(t.storybookId, t.position),
  })
);

/* ── Assets (images, video, embed bundles, posters) ─────────── */
export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  storageKey: text("storage_key").notNull(), // R2 / uploads path
  mimeType: text("mime_type").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ── Viewers (audience email capture, OTP gate) ─────────────── */
export const viewers = pgTable(
  "viewers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    otpHash: text("otp_hash"), // hashed one-time code, cleared after use
    otpExpires: timestamp("otp_expires", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    optedOut: timestamp("opted_out", { withTimezone: true }), // unsubscribe stamp
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("viewers_email_idx").on(t.email),
  })
);

/* ── View events (who opened which book, when) ──────────────── */
export const viewEvents = pgTable(
  "view_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    viewerId: uuid("viewer_id")
      .notNull()
      .references(() => viewers.id, { onDelete: "cascade" }),
    storybookId: uuid("storybook_id")
      .notNull()
      .references(() => storybooks.id, { onDelete: "cascade" }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookIdx: index("view_events_book_idx").on(t.storybookId),
    viewerIdx: index("view_events_viewer_idx").on(t.viewerId),
  })
);
