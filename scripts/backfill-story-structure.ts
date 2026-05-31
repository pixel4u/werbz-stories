import "dotenv/config";

import { asc, eq } from "drizzle-orm";

import { getDb } from "../src/db/client";
import { pages, storybooks } from "../src/db/schema";

async function main() {
  const db = getDb();
  const books = await db.select().from(storybooks).orderBy(asc(storybooks.slug));

  let updated = 0;
  let ambiguous = 0;

  for (const book of books) {
    const bookPages = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.storybookId, book.id))
      .orderBy(asc(pages.position));

    let coverPageId: string | null = book.coverPageId ?? null;
    let endPageId: string | null = book.endPageId ?? null;

    if (bookPages.length === 0) {
      coverPageId = null;
      endPageId = null;
      ambiguous++;
      console.log(`[backfill] ${book.slug}: no pages (cover/end unset)`);
    } else if (bookPages.length === 1) {
      coverPageId = bookPages[0].id;
      endPageId = null;
      ambiguous++;
      console.log(`[backfill] ${book.slug}: single page (cover=${coverPageId}, end=null)`);
    } else {
      coverPageId = coverPageId && bookPages.some((p) => p.id === coverPageId) ? coverPageId : bookPages[0].id;
      endPageId = endPageId && bookPages.some((p) => p.id === endPageId) ? endPageId : bookPages[bookPages.length - 1].id;
      if (endPageId === coverPageId) {
        endPageId = bookPages[bookPages.length - 1].id;
      }
    }

    if (coverPageId !== book.coverPageId || endPageId !== book.endPageId) {
      await db
        .update(storybooks)
        .set({
          coverPageId,
          endPageId,
          updatedAt: new Date(),
        })
        .where(eq(storybooks.id, book.id));
      updated++;
    }
  }

  console.log(`[backfill] done. books=${books.length} updated=${updated} ambiguous=${ambiguous}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

