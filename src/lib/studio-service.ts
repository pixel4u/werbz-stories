import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { pages, storybooks, viewEvents } from "@/db/schema";

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
