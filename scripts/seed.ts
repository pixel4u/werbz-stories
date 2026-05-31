import "dotenv/config";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { assets, pages, storybooks } from "../src/db/schema";
import sample from "../specs/sample-storybook.json";
import { parseStorybook } from "../src/lib/stories/schema";

async function upsertAssetId(id: string) {
  const db = getDb();
  await db
    .insert(assets)
    .values({
      id,
      storageKey: `seed/${id}`,
      mimeType: "application/octet-stream",
      bytes: 0,
    })
    .onConflictDoNothing({ target: assets.id });
}

async function main() {
  const db = getDb();
  const storybook = parseStorybook(sample);

  const assetIds = new Set<string>();
  if (storybook.coverAssetId) assetIds.add(storybook.coverAssetId);

  for (const page of storybook.pages) {
    const content = page.content;
    if (content.kind === "image" || content.kind === "video") {
      assetIds.add(content.assetId);
      if (content.kind === "video" && content.poster) assetIds.add(content.poster);
    }
    if (content.kind === "embed") {
      assetIds.add(content.poster);
      if (content.source.type === "asset") assetIds.add(content.source.assetId);
    }
  }

  for (const assetId of assetIds) {
    await upsertAssetId(assetId);
  }

  await db
    .insert(storybooks)
    .values({
      id: storybook.id,
      slug: storybook.slug,
      title: storybook.title,
      summary: storybook.summary,
      coverAssetId: storybook.coverAssetId,
      status: storybook.status,
      theme: storybook.theme,
      createdAt: new Date(storybook.createdAt),
      updatedAt: new Date(storybook.updatedAt),
    })
    .onConflictDoUpdate({
      target: storybooks.id,
      set: {
        slug: storybook.slug,
        title: storybook.title,
        summary: storybook.summary,
        coverAssetId: storybook.coverAssetId,
        status: storybook.status,
        theme: storybook.theme,
        updatedAt: new Date(storybook.updatedAt),
      },
    });

  await db.delete(pages).where(eq(pages.storybookId, storybook.id));

  if (storybook.pages.length > 0) {
    await db.insert(pages).values(
      storybook.pages.map((page) => ({
        id: page.id,
        storybookId: storybook.id,
        position: page.position,
        side: page.side,
        content: page.content,
      }))
    );
  }

  const coverPageId = storybook.pages[0]?.id ?? null;
  const endPageId = storybook.pages.length > 1 ? storybook.pages[storybook.pages.length - 1]?.id ?? null : null;
  await db
    .update(storybooks)
    .set({
      coverPageId,
      endPageId,
      updatedAt: new Date(storybook.updatedAt),
    })
    .where(eq(storybooks.id, storybook.id));

  await db.execute(sql`select 1`);
  console.log(`Seeded storybook: ${storybook.slug}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
