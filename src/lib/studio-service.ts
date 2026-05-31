import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { assets, pages, storybooks, viewEvents } from "@/db/schema";
import { PageContent, PageSide, type PageContent as PageContentType, type PageSide as PageSideType } from "@/lib/stories/schema";

export interface StudioStorybookRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: "draft" | "published";
  coverAssetId: string | null;
  coverPageId: string | null;
  endPageId: string | null;
  updatedAt: Date;
  pageCount: number;
  viewCount: number;
}

export interface StudioPageRow {
  id: string;
  storybookId: string;
  position: number;
  side: "left" | "right";
  content: PageContentType;
}

export interface StudioStorybookDetail extends StudioStorybookRow {
  theme: Record<string, unknown> | null;
  pages: StudioPageRow[];
}

interface StoryStructurePointers {
  coverPageId: string | null;
  endPageId: string | null;
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return extname(mimeType) || ".bin";
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "untitled-storybook";
}

async function isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const db = getDb();
  const rows = excludeId
    ? await db
        .select({ id: storybooks.id })
        .from(storybooks)
        .where(and(eq(storybooks.slug, slug), sql`${storybooks.id} <> ${excludeId}`))
        .limit(1)
    : await db.select({ id: storybooks.id }).from(storybooks).where(eq(storybooks.slug, slug)).limit(1);
  return rows.length > 0;
}

export async function generateUniqueSlug(baseInput: string, excludeId?: string): Promise<string> {
  const base = slugify(baseInput);
  if (!(await isSlugTaken(base, excludeId))) return base;

  for (let i = 2; i < 5000; i++) {
    const candidate = `${base}-${i}`;
    if (!(await isSlugTaken(candidate, excludeId))) return candidate;
  }

  throw new Error("Unable to generate unique slug");
}

export async function listStudioStorybooks(): Promise<StudioStorybookRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: storybooks.id,
      title: storybooks.title,
      slug: storybooks.slug,
      summary: storybooks.summary,
      status: storybooks.status,
      coverAssetId: storybooks.coverAssetId,
      coverPageId: storybooks.coverPageId,
      endPageId: storybooks.endPageId,
      updatedAt: storybooks.updatedAt,
      pageCount: sql<number>`count(distinct ${pages.id})::int`,
      viewCount: sql<number>`count(distinct ${viewEvents.id})::int`,
    })
    .from(storybooks)
    .leftJoin(pages, eq(pages.storybookId, storybooks.id))
    .leftJoin(viewEvents, eq(viewEvents.storybookId, storybooks.id))
    .groupBy(
      storybooks.id,
      storybooks.title,
      storybooks.slug,
      storybooks.summary,
      storybooks.status,
      storybooks.coverAssetId,
      storybooks.coverPageId,
      storybooks.endPageId,
      storybooks.updatedAt
    )
    .orderBy(asc(storybooks.title));

  return rows.map((row) => ({ ...row, pageCount: Number(row.pageCount), viewCount: Number(row.viewCount) }));
}

export async function getStudioStorybookById(id: string): Promise<StudioStorybookDetail | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(storybooks)
    .where(eq(storybooks.id, id))
    .limit(1);
  const storybook = rows[0];
  if (!storybook) return null;
  const pointers = await ensureStorybookStructure(id);

  const pageRows = await db
    .select()
    .from(pages)
    .where(eq(pages.storybookId, id))
    .orderBy(asc(pages.position));

  const viewCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(viewEvents)
    .where(eq(viewEvents.storybookId, id));

  const cover = pointers.coverPageId ? pageRows.find((p) => p.id === pointers.coverPageId) : undefined;
  const end = pointers.endPageId ? pageRows.find((p) => p.id === pointers.endPageId) : undefined;
  const excluded = new Set<string>([cover?.id ?? "", end?.id ?? ""]);
  const middle = pageRows.filter((p) => !excluded.has(p.id)).sort((a, b) => a.position - b.position);
  const ordered = [...(cover ? [cover] : []), ...middle, ...(end ? [end] : [])];

  return {
    id: storybook.id,
    title: storybook.title,
    slug: storybook.slug,
    summary: storybook.summary,
    status: storybook.status,
    coverAssetId: storybook.coverAssetId,
    coverPageId: pointers.coverPageId,
    endPageId: pointers.endPageId,
    updatedAt: storybook.updatedAt,
    pageCount: ordered.length,
    viewCount: Number(viewCountRows[0]?.count ?? 0),
    theme: (storybook.theme as Record<string, unknown> | null) ?? null,
    pages: ordered.map((page, idx) => ({
      id: page.id,
      storybookId: page.storybookId,
      position: idx,
      side: page.side,
      content: PageContent.parse(page.content),
    })),
  };
}

export async function createStorybook(): Promise<string> {
  const db = getDb();
  const title = "Untitled Storybook";
  const slug = await generateUniqueSlug("untitled-storybook");

  const rows = await db
    .insert(storybooks)
    .values({ title, slug, status: "draft" })
    .returning({ id: storybooks.id });

  return rows[0].id;
}

export interface UpdateStorybookMetaInput {
  id: string;
  title: string;
  slug: string;
  summary: string;
  status: "draft" | "published";
  coverAssetId: string;
}

export async function updateStorybookMeta(input: UpdateStorybookMetaInput): Promise<void> {
  const db = getDb();
  const safeTitle = input.title.trim() || "Untitled Storybook";
  const safeSlug = await generateUniqueSlug(input.slug || safeTitle, input.id);

  await db
    .update(storybooks)
    .set({
      title: safeTitle,
      slug: safeSlug,
      summary: input.summary.trim() || null,
      status: input.status,
      coverAssetId: input.coverAssetId.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(storybooks.id, input.id));
}

export async function setStorybookStatus(id: string, status: "draft" | "published"): Promise<void> {
  const db = getDb();
  await db
    .update(storybooks)
    .set({ status, updatedAt: new Date() })
    .where(eq(storybooks.id, id));
}

// Set only the library thumbnail (coverAssetId). The reader's front cover comes
// from the canonical cover PAGE, not this field.
export async function setStorybookCoverAsset(id: string, assetId: string): Promise<void> {
  const db = getDb();
  await db
    .update(storybooks)
    .set({ coverAssetId: assetId, updatedAt: new Date() })
    .where(eq(storybooks.id, id));
}

export async function deleteStorybook(id: string): Promise<void> {
  const db = getDb();
  await db.delete(storybooks).where(eq(storybooks.id, id));
}

export async function duplicateStorybook(id: string): Promise<void> {
  const db = getDb();

  const sourceRows = await db.select().from(storybooks).where(eq(storybooks.id, id)).limit(1);
  const source = sourceRows[0];
  if (!source) throw new Error("Storybook not found");

  const newTitle = `${source.title} Copy`;
  const newSlug = await generateUniqueSlug(`${source.slug}-copy`);

  const inserted = await db
    .insert(storybooks)
    .values({
      title: newTitle,
      slug: newSlug,
      summary: source.summary,
      coverAssetId: source.coverAssetId,
      status: "draft",
      theme: source.theme,
    })
    .returning({ id: storybooks.id });

  const newId = inserted[0].id;

  const sourcePages = await db
    .select()
    .from(pages)
    .where(eq(pages.storybookId, id))
    .orderBy(asc(pages.position));

  if (sourcePages.length > 0) {
    const idMap = new Map<string, string>();
    const copiedPages = sourcePages.map((page) => {
      const nextId = `${page.id}-copy-${randomUUID().slice(0, 8)}`;
      idMap.set(page.id, nextId);
      return {
        id: nextId,
        storybookId: newId,
        position: page.position,
        side: page.side,
        content: page.content,
      };
    });
    await db.insert(pages).values(copiedPages);

    await db
      .update(storybooks)
      .set({
        coverPageId: source.coverPageId ? idMap.get(source.coverPageId) ?? null : null,
        endPageId: source.endPageId ? idMap.get(source.endPageId) ?? null : null,
        updatedAt: new Date(),
      })
      .where(eq(storybooks.id, newId));
  }

  await ensureStorybookStructure(newId);
  await normalizePagePositions(newId);
}

function defaultContentForType(kind: "text" | "image" | "video" | "embed"): PageContentType {
  if (kind === "text") {
    return {
      kind: "text",
      eyebrow: "",
      title: "Untitled Page",
      body: "",
      align: "left",
    };
  }
  if (kind === "image") {
    return {
      kind: "image",
      assetId: "asset-placeholder-image",
      fit: "cover",
      caption: "",
    };
  }
  if (kind === "video") {
    return {
      kind: "video",
      assetId: "asset-placeholder-video",
      poster: "asset-placeholder-poster",
      autoplay: true,
      loop: true,
      muted: true,
    };
  }
  return {
    kind: "embed",
    source: { type: "asset", assetId: "asset-placeholder-embed" },
    poster: "asset-placeholder-poster",
    interactive: true,
  };
}

async function normalizePagePositions(storybookId: string): Promise<void> {
  const db = getDb();
  const storybookRows = await db
    .select({ coverPageId: storybooks.coverPageId, endPageId: storybooks.endPageId })
    .from(storybooks)
    .where(eq(storybooks.id, storybookId))
    .limit(1);
  const pointers = storybookRows[0];

  const rows = await db
    .select({ id: pages.id, position: pages.position })
    .from(pages)
    .where(eq(pages.storybookId, storybookId))
    .orderBy(asc(pages.position));

  const cover = pointers?.coverPageId ? rows.find((r) => r.id === pointers.coverPageId) : undefined;
  const end = pointers?.endPageId ? rows.find((r) => r.id === pointers.endPageId) : undefined;
  const excluded = new Set<string>([cover?.id ?? "", end?.id ?? ""]);
  const middle = rows.filter((r) => !excluded.has(r.id));
  const normalizedOrder = [...(cover ? [cover] : []), ...middle, ...(end ? [end] : [])];

  for (let i = 0; i < normalizedOrder.length; i++) {
    await db.update(pages).set({ position: i }).where(eq(pages.id, normalizedOrder[i].id));
  }
}

async function ensureStorybookStructure(storybookId: string): Promise<StoryStructurePointers> {
  const db = getDb();
  const bookRows = await db
    .select({ coverPageId: storybooks.coverPageId, endPageId: storybooks.endPageId })
    .from(storybooks)
    .where(eq(storybooks.id, storybookId))
    .limit(1);
  const book = bookRows[0];
  if (!book) throw new Error("Storybook not found");

  const orderedPages = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.storybookId, storybookId))
    .orderBy(asc(pages.position));

  let coverPageId = book.coverPageId;
  let endPageId = book.endPageId;

  if (orderedPages.length === 0) {
    coverPageId = null;
    endPageId = null;
  } else {
    const valid = new Set(orderedPages.map((p) => p.id));
    if (!coverPageId || !valid.has(coverPageId)) {
      coverPageId = orderedPages[0].id;
    }
    if (!endPageId || !valid.has(endPageId) || endPageId === coverPageId) {
      endPageId = orderedPages.length > 1 ? orderedPages[orderedPages.length - 1].id : null;
    }
  }

  if (coverPageId !== book.coverPageId || endPageId !== book.endPageId) {
    await db
      .update(storybooks)
      .set({ coverPageId, endPageId, updatedAt: new Date() })
      .where(eq(storybooks.id, storybookId));
  }

  return { coverPageId, endPageId };
}

export async function addPage(
  storybookId: string,
  kind: "text" | "image" | "video" | "embed",
  side?: PageSideType,
  options?: { insertBeforeEnd?: boolean }
): Promise<string> {
  const db = getDb();
  const content = PageContent.parse(defaultContentForType(kind));

  const maxRows = await db
    .select({ max: sql<number>`coalesce(max(${pages.position}), -1)::int` })
    .from(pages)
    .where(eq(pages.storybookId, storybookId));
  let nextPosition = Number(maxRows[0]?.max ?? -1) + 1;

  // A single "Add Page" should land as the last STORY page, just before the End,
  // not replace the End. When requested and an end page exists, take the end's
  // slot (it shifts back during normalization). Bulk upload omits this and
  // appends in order so the final image stays the End.
  if (options?.insertBeforeEnd) {
    const bookRows = await db
      .select({ endPageId: storybooks.endPageId })
      .from(storybooks)
      .where(eq(storybooks.id, storybookId))
      .limit(1);
    const endPageId = bookRows[0]?.endPageId ?? null;
    if (endPageId) {
      const endRows = await db
        .select({ position: pages.position })
        .from(pages)
        .where(eq(pages.id, endPageId))
        .limit(1);
      if (endRows[0]) {
        const endPos = endRows[0].position;
        // Open a slot at the end's position by pushing the end (and anything at
        // or after it) back by one.
        await db
          .update(pages)
          .set({ position: sql`${pages.position} + 1` })
          .where(and(eq(pages.storybookId, storybookId), sql`${pages.position} >= ${endPos}`));
        nextPosition = endPos;
      }
    }
  }

  // Spread side is a presentation detail the admin never sets manually: derive
  // it from position (even = left, odd = right) unless a caller passes one.
  const safeSide = PageSide.parse(side ?? (nextPosition % 2 === 0 ? "left" : "right"));

  const pageId = `page-${randomUUID()}`;
  await db.insert(pages).values({
    id: pageId,
    storybookId,
    position: nextPosition,
    side: safeSide,
    content,
  });

  await ensureStorybookStructure(storybookId);
  await normalizePagePositions(storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, storybookId));
  return pageId;
}

export async function updatePage(input: {
  pageId: string;
  side: PageSideType;
  content: unknown;
}): Promise<void> {
  const db = getDb();
  const safeSide = PageSide.parse(input.side);
  const safeContent = PageContent.parse(input.content);

  const rows = await db
    .select({ storybookId: pages.storybookId })
    .from(pages)
    .where(eq(pages.id, input.pageId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Page not found");

  await db
    .update(pages)
    .set({ side: safeSide, content: safeContent })
    .where(eq(pages.id, input.pageId));

  await ensureStorybookStructure(row.storybookId);
  await normalizePagePositions(row.storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, row.storybookId));
}

export async function deletePage(pageId: string): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ storybookId: pages.storybookId })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  const row = rows[0];
  if (!row) return;

  await db.delete(pages).where(eq(pages.id, pageId));
  await ensureStorybookStructure(row.storybookId);
  await normalizePagePositions(row.storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, row.storybookId));
}

export async function duplicatePage(pageId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const source = rows[0];
  if (!source) return null;

  const insertedId = `page-${randomUUID()}`;
  const insertPosition = source.position + 1;

  await db
    .update(pages)
    .set({ position: sql`${pages.position} + 1` })
    .where(and(eq(pages.storybookId, source.storybookId), sql`${pages.position} >= ${insertPosition}`));

  await db.insert(pages).values({
    id: insertedId,
    storybookId: source.storybookId,
    position: insertPosition,
    side: source.side,
    content: source.content,
  });

  await ensureStorybookStructure(source.storybookId);
  await normalizePagePositions(source.storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, source.storybookId));
  return insertedId;
}

export async function movePageUp(pageId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];
  if (!page || page.position <= 0) return;

  const prevRows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.storybookId, page.storybookId), eq(pages.position, page.position - 1)))
    .limit(1);
  const prev = prevRows[0];
  if (!prev) return;

  await db.update(pages).set({ position: page.position }).where(eq(pages.id, prev.id));
  await db.update(pages).set({ position: page.position - 1 }).where(eq(pages.id, page.id));
  await ensureStorybookStructure(page.storybookId);
  await normalizePagePositions(page.storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, page.storybookId));
}

export async function movePageDown(pageId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
  const page = rows[0];
  if (!page) return;

  const nextRows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.storybookId, page.storybookId), eq(pages.position, page.position + 1)))
    .limit(1);
  const next = nextRows[0];
  if (!next) return;

  await db.update(pages).set({ position: page.position }).where(eq(pages.id, next.id));
  await db.update(pages).set({ position: page.position + 1 }).where(eq(pages.id, page.id));
  await ensureStorybookStructure(page.storybookId);
  await normalizePagePositions(page.storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, page.storybookId));
}

export async function uploadImageAssetForPage(input: {
  storybookId: string;
  pageId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  width?: number;
  height?: number;
  // "page-image": image-page asset; "text-background": cover/text bg photo.
  target?: "page-image" | "text-background";
}): Promise<{ assetId: string }> {
  const db = getDb();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error("Unsupported image type");
  }

  const pageRows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, input.pageId), eq(pages.storybookId, input.storybookId)))
    .limit(1);
  const page = pageRows[0];
  if (!page) throw new Error("Page not found");

  const parsedContent = PageContent.parse(page.content);
  const target = input.target ?? (parsedContent.kind === "image" ? "page-image" : "text-background");
  if (target === "page-image" && parsedContent.kind !== "image") {
    throw new Error("Image-page uploads are only enabled for image pages");
  }
  if (target === "text-background" && parsedContent.kind !== "text") {
    throw new Error("Background photo is only available on text pages");
  }

  const assetId = `asset-upload-${randomUUID()}`;
  const ext = extensionForMimeType(input.mimeType);
  const storageKey = `${assetId}${ext}`;
  const filePath = join(uploadsDir(), storageKey);

  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(filePath, input.bytes);

  await db.insert(assets).values({
    id: assetId,
    storageKey,
    mimeType: input.mimeType,
    bytes: input.bytes.length,
    width: input.width ?? null,
    height: input.height ?? null,
  });

  const nextContent =
    target === "page-image"
      ? { ...parsedContent, assetId }
      : { ...parsedContent, backgroundAssetId: assetId };

  await updatePage({
    pageId: input.pageId,
    side: page.side,
    content: nextContent,
  });

  return { assetId };
}

export async function uploadCoverAssetForStorybook(input: {
  storybookId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  width?: number;
  height?: number;
}): Promise<{ assetId: string }> {
  const db = getDb();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error("Unsupported image type");
  }

  const storybookRows = await db.select().from(storybooks).where(eq(storybooks.id, input.storybookId)).limit(1);
  const storybook = storybookRows[0];
  if (!storybook) throw new Error("Storybook not found");

  const assetId = `asset-upload-${randomUUID()}`;
  const ext = extensionForMimeType(input.mimeType);
  const storageKey = `${assetId}${ext}`;
  const filePath = join(uploadsDir(), storageKey);

  await mkdir(uploadsDir(), { recursive: true });
  await writeFile(filePath, input.bytes);

  await db.insert(assets).values({
    id: assetId,
    storageKey,
    mimeType: input.mimeType,
    bytes: input.bytes.length,
    width: input.width ?? null,
    height: input.height ?? null,
  });

  await db
    .update(storybooks)
    .set({
      coverAssetId: assetId,
      updatedAt: new Date(),
    })
    .where(eq(storybooks.id, input.storybookId));

  return { assetId };
}

// Remove a page's photo. For text pages this clears the optional background
// photo; for image pages it blanks the asset (the page then shows a placeholder
// until a new image is uploaded).
export async function removePageImage(input: {
  storybookId: string;
  pageId: string;
}): Promise<void> {
  const db = getDb();
  const pageRows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, input.pageId), eq(pages.storybookId, input.storybookId)))
    .limit(1);
  const page = pageRows[0];
  if (!page) throw new Error("Page not found");

  const parsedContent = PageContent.parse(page.content);
  let nextContent: PageContent;
  if (parsedContent.kind === "text") {
    const { backgroundAssetId: _omit, ...rest } = parsedContent;
    void _omit;
    nextContent = rest;
  } else if (parsedContent.kind === "image") {
    nextContent = { ...parsedContent, assetId: "" };
  } else {
    return; // nothing to remove on video/embed here
  }

  await updatePage({ pageId: input.pageId, side: page.side, content: nextContent });
}
