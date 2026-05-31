import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { pages, storybooks } from "@/db/schema";
import {
  parseCanonicalStorybook,
  parseStorybook,
  type CanonicalStorybook,
  StorybookListItem,
  type Storybook,
  type StorybookListItem as StorybookListItemType,
} from "@/lib/stories/schema";

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getStorybookBySlug(slug: string): Promise<Storybook | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(storybooks)
    .where(eq(storybooks.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const pageRows = await db
    .select()
    .from(pages)
    .where(eq(pages.storybookId, row.id))
    .orderBy(asc(pages.position));

  const storybook = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? undefined,
    coverAssetId: row.coverAssetId ?? undefined,
    status: row.status,
    theme: row.theme ?? undefined,
    pages: pageRows.map((page) => ({
      id: page.id,
      position: page.position,
      side: page.side,
      content: page.content,
    })),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };

  return parseStorybook(storybook);
}

function toCanonicalStorybook(storybook: Storybook): CanonicalStorybook {
  const ordered = [...storybook.pages].sort((a, b) => a.position - b.position);
  const cover = ordered.length > 0 ? ordered[0] : undefined;
  const end = ordered.length > 1 ? ordered[ordered.length - 1] : undefined;
  const pages = ordered.slice(cover ? 1 : 0, end ? -1 : undefined);
  return parseCanonicalStorybook({
    ...storybook,
    cover,
    pages,
    end,
  });
}

export async function getCanonicalStorybookBySlug(slug: string): Promise<CanonicalStorybook | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(storybooks)
    .where(eq(storybooks.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const pageRows = await db
    .select()
    .from(pages)
    .where(eq(pages.storybookId, row.id))
    .orderBy(asc(pages.position));

  const pageMap = new Map(
    pageRows.map((page) => [
      page.id,
      {
        id: page.id,
        position: page.position,
        side: page.side,
        content: page.content,
      },
    ])
  );

  const cover = row.coverPageId ? pageMap.get(row.coverPageId) : undefined;
  const end = row.endPageId ? pageMap.get(row.endPageId) : undefined;
  const excluded = new Set<string>([row.coverPageId ?? "", row.endPageId ?? ""]);
  const middle = [...pageMap.values()]
    .filter((p) => !excluded.has(p.id))
    .sort((a, b) => a.position - b.position)
    .map((p, idx) => ({ ...p, position: idx }));

  return parseCanonicalStorybook({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? undefined,
    coverAssetId: row.coverAssetId ?? undefined,
    status: row.status,
    theme: row.theme ?? undefined,
    cover: cover
      ? {
          ...cover,
          position: 0,
        }
      : undefined,
    pages: middle,
    end: end
      ? {
          ...end,
          position: middle.length + 1,
        }
      : undefined,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  });
}

export async function getPublishedStorybookBySlug(slug: string): Promise<CanonicalStorybook | null> {
  const canonical = await getCanonicalStorybookBySlug(slug);
  if (canonical) {
    return canonical.status === "published" ? canonical : null;
  }

  const legacy = await getStorybookBySlug(slug);
  if (!legacy) return null;
  if (legacy.status !== "published") return null;
  return toCanonicalStorybook(legacy);
}

export async function getPublishedLegacyStorybookBySlug(slug: string): Promise<Storybook | null> {
  const storybook = await getStorybookBySlug(slug);
  if (!storybook) return null;
  return storybook.status === "published" ? storybook : null;
}

export async function listPublishedStorybooks(): Promise<StorybookListItemType[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(storybooks)
    .where(eq(storybooks.status, "published"))
    .orderBy(asc(storybooks.title));

  return rows.map((row) =>
    StorybookListItem.parse({
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? undefined,
      coverAssetId: row.coverAssetId ?? undefined,
      status: row.status,
      updatedAt: toIsoString(row.updatedAt),
    })
  );
}
