import { asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { assets, pages, storybooks } from "@/db/schema";
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

function parseAssetIdFromPageContent(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const c = content as Record<string, unknown>;
  const kind = typeof c.kind === "string" ? c.kind : "";
  if (kind === "image" || kind === "video") {
    return typeof c.assetId === "string" && c.assetId ? c.assetId : null;
  }
  if (kind === "embed") {
    const source = c.source;
    if (source && typeof source === "object") {
      const src = source as Record<string, unknown>;
      if (src.type === "asset" && typeof src.assetId === "string" && src.assetId) return src.assetId;
    }
    return null;
  }
  if (kind === "text") {
    return typeof c.backgroundAssetId === "string" && c.backgroundAssetId ? c.backgroundAssetId : null;
  }
  return null;
}

async function derivePageAspectRatio(args: {
  coverPageId: string | null;
  endPageId: string | null;
  pageRows: Array<{ id: string; content: unknown }>;
  theme: unknown;
}): Promise<number | undefined> {
  const theme = args.theme;
  if (theme && typeof theme === "object") {
    const t = theme as Record<string, unknown>;
    if (typeof t.pageAspectRatio === "number" && Number.isFinite(t.pageAspectRatio) && t.pageAspectRatio > 0) {
      return t.pageAspectRatio;
    }
  }

  const pageMap = new Map(args.pageRows.map((p) => [p.id, p]));
  const coverPage = args.coverPageId ? pageMap.get(args.coverPageId) : undefined;
  const endPage = args.endPageId ? pageMap.get(args.endPageId) : undefined;

  const middle = args.pageRows.filter((p) => p.id !== args.coverPageId && p.id !== args.endPageId);
  const candidateAssetIds = [
    coverPage ? parseAssetIdFromPageContent(coverPage.content) : null,
    ...middle.map((p) => parseAssetIdFromPageContent(p.content)),
    endPage ? parseAssetIdFromPageContent(endPage.content) : null,
  ].filter((v): v is string => Boolean(v));

  if (candidateAssetIds.length === 0) return undefined;

  const db = getDb();
  const uniqueIds = [...new Set(candidateAssetIds)];
  const byId = new Map<string, { width: number | null; height: number | null }>();
  for (const id of uniqueIds) {
    const row = await db.select({ id: assets.id, width: assets.width, height: assets.height }).from(assets).where(eq(assets.id, id)).limit(1);
    if (row[0]) byId.set(row[0].id, { width: row[0].width, height: row[0].height });
  }

  for (const assetId of candidateAssetIds) {
    const meta = byId.get(assetId);
    if (!meta || !meta.width || !meta.height || meta.width <= 0 || meta.height <= 0) continue;
    const ratio = meta.width / meta.height;
    if (Number.isFinite(ratio) && ratio > 0) return ratio;
  }
  return undefined;
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

  const pageAspectRatio = await derivePageAspectRatio({
    coverPageId: row.coverPageId ?? null,
    endPageId: row.endPageId ?? null,
    pageRows,
    theme: row.theme,
  });

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
    pageAspectRatio,
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

// Library-card aspect ratio (width / height): theme override first, else the
// cover asset's real pixel dimensions. Undefined when unknown (card falls back
// to a default shape). No schema change — reuses assets.width/height.
async function deriveListItemAspectRatio(row: {
  theme: unknown;
  coverAssetId: string | null;
}): Promise<number | undefined> {
  if (row.theme && typeof row.theme === "object") {
    const t = row.theme as Record<string, unknown>;
    if (typeof t.pageAspectRatio === "number" && Number.isFinite(t.pageAspectRatio) && t.pageAspectRatio > 0) {
      return t.pageAspectRatio;
    }
  }
  if (!row.coverAssetId) return undefined;
  const db = getDb();
  const a = await db
    .select({ width: assets.width, height: assets.height })
    .from(assets)
    .where(eq(assets.id, row.coverAssetId))
    .limit(1);
  const meta = a[0];
  if (meta && meta.width && meta.height && meta.width > 0 && meta.height > 0) {
    const ratio = meta.width / meta.height;
    if (Number.isFinite(ratio) && ratio > 0) return ratio;
  }
  return undefined;
}

export async function listPublishedStorybooks(): Promise<StorybookListItemType[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(storybooks)
    .where(eq(storybooks.status, "published"))
    .orderBy(asc(storybooks.title));

  return Promise.all(
    rows.map(async (row) =>
      StorybookListItem.parse({
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary ?? undefined,
        coverAssetId: row.coverAssetId ?? undefined,
        status: row.status,
        updatedAt: toIsoString(row.updatedAt),
        pageAspectRatio: await deriveListItemAspectRatio({ theme: row.theme, coverAssetId: row.coverAssetId }),
      })
    )
  );
}
