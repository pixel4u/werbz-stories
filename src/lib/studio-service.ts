import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { pages, storybooks, viewEvents } from "@/db/schema";
import { PageContent, PageSide, type PageContent as PageContentType, type PageSide as PageSideType } from "@/lib/stories/schema";

export interface StudioStorybookRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: "draft" | "published";
  coverAssetId: string | null;
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

  const pageRows = await db
    .select()
    .from(pages)
    .where(eq(pages.storybookId, id))
    .orderBy(asc(pages.position));

  const viewCountRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(viewEvents)
    .where(eq(viewEvents.storybookId, id));

  return {
    id: storybook.id,
    title: storybook.title,
    slug: storybook.slug,
    summary: storybook.summary,
    status: storybook.status,
    coverAssetId: storybook.coverAssetId,
    updatedAt: storybook.updatedAt,
    pageCount: pageRows.length,
    viewCount: Number(viewCountRows[0]?.count ?? 0),
    theme: (storybook.theme as Record<string, unknown> | null) ?? null,
    pages: pageRows.map((page) => ({
      id: page.id,
      storybookId: page.storybookId,
      position: page.position,
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
    await db.insert(pages).values(
      sourcePages.map((page) => ({
        id: `${page.id}-copy-${randomUUID().slice(0, 8)}`,
        storybookId: newId,
        position: page.position,
        side: page.side,
        content: page.content,
      }))
    );
  }
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
  const rows = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.storybookId, storybookId))
    .orderBy(asc(pages.position));

  for (let i = 0; i < rows.length; i++) {
    await db.update(pages).set({ position: i }).where(eq(pages.id, rows[i].id));
  }
}

export async function addPage(
  storybookId: string,
  kind: "text" | "image" | "video" | "embed",
  side: PageSideType
): Promise<void> {
  const db = getDb();
  const safeSide = PageSide.parse(side);
  const content = PageContent.parse(defaultContentForType(kind));

  const maxRows = await db
    .select({ max: sql<number>`coalesce(max(${pages.position}), -1)::int` })
    .from(pages)
    .where(eq(pages.storybookId, storybookId));
  const nextPosition = Number(maxRows[0]?.max ?? -1) + 1;

  await db.insert(pages).values({
    id: `page-${randomUUID()}`,
    storybookId,
    position: nextPosition,
    side: safeSide,
    content,
  });

  await normalizePagePositions(storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, storybookId));
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
  await normalizePagePositions(row.storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, row.storybookId));
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
  await normalizePagePositions(page.storybookId);
  await db.update(storybooks).set({ updatedAt: new Date() }).where(eq(storybooks.id, page.storybookId));
}
