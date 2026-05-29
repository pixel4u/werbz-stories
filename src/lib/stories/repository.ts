import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { pages, storybooks } from "@/db/schema";
import {
  parseStorybook,
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
