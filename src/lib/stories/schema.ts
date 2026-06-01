/**
 * werbz Stories — Shared content contract
 * --------------------------------------------------
 * This is the SINGLE SOURCE OF TRUTH for what a Storybook is.
 * It is imported by BOTH the Studio (editor) and the 3D Book (viewer),
 * so neither side can drift from the other.
 *
 * Path suggestion in this standalone app:
 *   src/lib/stories/schema.ts
 *
 * Rule of thumb: the Studio writes objects of these types; the Book
 * reads objects of these types. The database `content` jsonb column
 * stores exactly the `PageContent` union. Nothing else needs to know
 * the internals of a page.
 */

import { z } from "zod";

/* ────────────────────────────────────────────────────────────
   PAGE TYPES
   Each page renders into ONE leaf (left or right) of the open book.
   A "spread" is the pair the reader sees at once: pages[2k], pages[2k+1].
   ──────────────────────────────────────────────────────────── */

export const PageSide = z.enum(["left", "right"]);
export type PageSide = z.infer<typeof PageSide>;

/**
 * TEXT — rendered to a canvas texture (Path A in the build plan).
 * Uses the same canvas-draw pipeline the prototype already has.
 * Keep the field set small and presentational; this is a *story page*,
 * not a CMS document.
 */
export const TextContent = z.object({
  kind: z.literal("text"),
  eyebrow: z.string().max(80).optional(), // e.g. "CHAPTER ONE"
  title: z.string().max(160).optional(),
  body: z.string().max(4000).optional(), // plain text or limited markdown
  align: z.enum(["left", "center", "right"]).default("left"),
  // visual treatment of the paper itself (still neutral-lit by the shader)
  background: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(), // solid color page
  // OPTIONAL background photo drawn behind the text. Used for the cover
  // ("picture + title") but available on any text page. A dark scrim keeps
  // the overlaid text readable.
  backgroundAssetId: z.string().optional(),
  backgroundFit: z.enum(["cover", "contain"]).optional(),
});
export type TextContent = z.infer<typeof TextContent>;

/**
 * IMAGE — a still that becomes the page texture (Path A).
 * `assetId` points at an uploaded file in object storage.
 */
export const ImageContent = z.object({
  kind: z.literal("image"),
  assetId: z.string(), // FK into assets table / storage key
  fit: z.enum(["cover", "contain"]).default("cover"),
  caption: z.string().max(240).optional(),
});
export type ImageContent = z.infer<typeof ImageContent>;

/**
 * VIDEO — plays on the settled leaf via THREE.VideoTexture (Path A,
 * but only animates once the page is at rest to save the flip budget).
 */
export const VideoContent = z.object({
  kind: z.literal("video"),
  assetId: z.string(),
  poster: z.string().optional(), // assetId of a still shown during the flip
  autoplay: z.boolean().default(true),
  loop: z.boolean().default(true),
  muted: z.boolean().default(true),
});
export type VideoContent = z.infer<typeof VideoContent>;

/**
 * EMBED — your live OpenGL / HTML animation pages (Path B).
 * During the flip we show `poster` on the curling texture; once the
 * leaf settles we mount the live bundle in a SANDBOXED iframe aligned
 * to the leaf's screen rectangle. `source` is either an uploaded HTML
 * bundle (assetId) or an external URL you control.
 */
export const EmbedContent = z.object({
  kind: z.literal("embed"),
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("asset"), assetId: z.string() }), // uploaded HTML bundle
    z.object({ type: z.literal("url"), url: z.string().url() }),
  ]),
  poster: z.string(), // assetId — REQUIRED so the flip never shows a blank leaf
  interactive: z.boolean().default(true), // false = decorative animation, no pointer events
});
export type EmbedContent = z.infer<typeof EmbedContent>;

export const PageContent = z.discriminatedUnion("kind", [
  TextContent,
  ImageContent,
  VideoContent,
  EmbedContent,
]);
export type PageContent = z.infer<typeof PageContent>;

/* ────────────────────────────────────────────────────────────
   PAGE & STORYBOOK
   ──────────────────────────────────────────────────────────── */

export const Page = z.object({
  id: z.string(),
  position: z.number().int().nonnegative(), // 0-based order within the book
  side: PageSide, // which leaf it renders into
  content: PageContent,
});
export type Page = z.infer<typeof Page>;

export const StorybookStatus = z.enum(["draft", "published"]);
export type StorybookStatus = z.infer<typeof StorybookStatus>;

export const Storybook = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/), // URL: /[slug]
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional(), // shown in the Library list
  coverAssetId: z.string().optional(), // thumbnail for the Library
  status: StorybookStatus.default("draft"),
  // OPTIONAL per-book look. If present, overrides the Book's default config.
  // This is exactly the JSON your "Copy config" button already exports.
  theme: z.record(z.string(), z.any()).optional(),
  pageAspectRatio: z.number().positive().optional(), // page width / page height
  pages: z.array(Page),
  createdAt: z.string(), // ISO
  updatedAt: z.string(),
});
export type Storybook = z.infer<typeof Storybook>;

/**
 * Canonical structure used across Studio + Reader:
 * - `cover` and `end` are explicit single-page slots
 * - `pages` are only the ordered middle story pages
 */
export const CanonicalStorybook = z.object({
  id: z.string(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional(),
  coverAssetId: z.string().optional(),
  status: StorybookStatus.default("draft"),
  theme: z.record(z.string(), z.any()).optional(),
  pageAspectRatio: z.number().positive().optional(), // page width / page height
  cover: Page.optional(),
  pages: z.array(Page),
  end: Page.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CanonicalStorybook = z.infer<typeof CanonicalStorybook>;

/* ────────────────────────────────────────────────────────────
   API SHAPES
   What the Library list endpoint returns (lightweight — no pages),
   vs. what the Book viewer fetches (full, with pages).
   ──────────────────────────────────────────────────────────── */

export const StorybookListItem = Storybook.pick({
  id: true,
  slug: true,
  title: true,
  summary: true,
  coverAssetId: true,
  status: true,
  updatedAt: true,
});
export type StorybookListItem = z.infer<typeof StorybookListItem>;

/** Validate anything coming from the DB / API before the Book renders it. */
export function parseStorybook(input: unknown): Storybook {
  return Storybook.parse(input);
}

export function parseCanonicalStorybook(input: unknown): CanonicalStorybook {
  return CanonicalStorybook.parse(input);
}
