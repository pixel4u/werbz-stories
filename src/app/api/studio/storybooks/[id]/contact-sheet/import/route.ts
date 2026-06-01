import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { assets, pages, storybooks } from "@/db/schema";
import { saveAssetFromBuffer } from "@/lib/assets";
import { isStudioAuthenticated } from "@/lib/studio-auth";

const MAX_IMPORT_CARDS = 400;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type ImportMode = "new" | "replace" | "append";
type CardRole = "cover" | "page" | "end";

interface ImportCardInput {
  box: { x: number; y: number; width: number; height: number };
  order: number;
  role: CardRole;
}

interface ImportPayload {
  sheetAssetId: string;
  cards: ImportCardInput[];
  mode?: ImportMode;
  targetStorybookId?: string;
}

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

function sanitizeSlugPart(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "storybook";
}

function parseBody(value: unknown): ImportPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid request body");
  const raw = value as Partial<ImportPayload>;
  const sheetAssetId = String(raw.sheetAssetId ?? "").trim();
  if (!sheetAssetId) throw new Error("sheetAssetId is required");
  if (!Array.isArray(raw.cards) || raw.cards.length === 0) throw new Error("cards are required");
  if (raw.cards.length > MAX_IMPORT_CARDS) throw new Error("Too many cards");

  const cards: ImportCardInput[] = raw.cards.map((card, idx) => {
    if (!card || typeof card !== "object") throw new Error(`Invalid card at index ${idx}`);
    const c = card as Partial<ImportCardInput>;
    const role = c.role;
    if (role !== "cover" && role !== "page" && role !== "end") throw new Error(`Invalid role at card ${idx}`);
    const orderRaw = c.order ?? idx;
    const order = Number.isFinite(Number(orderRaw)) ? Number(orderRaw) : idx;
    const box = c.box;
    if (!box || typeof box !== "object") throw new Error(`Invalid box at card ${idx}`);
    const boxObj = box as Record<string, unknown>;
    const x = Math.round(Number(boxObj.x));
    const y = Math.round(Number(boxObj.y));
    const width = Math.round(Number(boxObj.width));
    const height = Math.round(Number(boxObj.height));
    if (![x, y, width, height].every(Number.isFinite)) throw new Error(`Invalid box numbers at card ${idx}`);
    return { box: { x, y, width, height }, order, role };
  });

  const mode: ImportMode = raw.mode === "replace" || raw.mode === "append" ? raw.mode : "new";
  const targetStorybookId = raw.targetStorybookId ? String(raw.targetStorybookId).trim() : undefined;
  return { sheetAssetId, cards, mode, targetStorybookId };
}

function validateBoxesWithinBounds(cards: ImportCardInput[], width: number, height: number): void {
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (c.box.width <= 0 || c.box.height <= 0) throw new Error(`Card ${i + 1} has non-positive size`);
    if (c.box.x < 0 || c.box.y < 0) throw new Error(`Card ${i + 1} is out of bounds`);
    if (c.box.x + c.box.width > width || c.box.y + c.box.height > height) throw new Error(`Card ${i + 1} exceeds sheet bounds`);
  }
}

function sortImportCards(cards: ImportCardInput[]): ImportCardInput[] {
  return [...cards].sort((a, b) => a.order - b.order);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: routeStorybookId } = await context.params;

  try {
    const payload = parseBody(await request.json());

    if (payload.mode !== "new") {
      return NextResponse.json(
        {
          error: `Import mode '${payload.mode}' is not enabled yet. Use mode 'new' for safe import in this step.`,
          mode: payload.mode,
        },
        { status: 400 }
      );
    }

    const db = getDb();
    const sheetRows = await db.select().from(assets).where(eq(assets.id, payload.sheetAssetId)).limit(1);
    const sheet = sheetRows[0];
    if (!sheet) {
      return NextResponse.json({ error: "Sheet asset not found" }, { status: 404 });
    }

    if (!ALLOWED_IMAGE_MIME_TYPES.has(sheet.mimeType)) {
      return NextResponse.json({ error: "Sheet asset is not a supported image" }, { status: 400 });
    }

    const sheetPath = join(uploadsDir(), sheet.storageKey);
    const sheetBuffer = await readFile(sheetPath);
    const sheetMeta = await sharp(sheetBuffer).metadata();
    const sheetWidth = sheetMeta.width ?? null;
    const sheetHeight = sheetMeta.height ?? null;
    if (!sheetWidth || !sheetHeight) {
      return NextResponse.json({ error: "Could not read source image dimensions" }, { status: 400 });
    }

    const sortedCards = sortImportCards(payload.cards);
    validateBoxesWithinBounds(sortedCards, sheetWidth, sheetHeight);

    const coverCards = sortedCards.filter((c) => c.role === "cover");
    const endCards = sortedCards.filter((c) => c.role === "end");
    const pageCards = sortedCards.filter((c) => c.role === "page");

    if (coverCards.length !== 1) {
      return NextResponse.json({ error: `Import requires exactly 1 cover card, found ${coverCards.length}` }, { status: 400 });
    }
    if (endCards.length !== 1) {
      return NextResponse.json({ error: `Import requires exactly 1 end card, found ${endCards.length}` }, { status: 400 });
    }

    const importPlan = [coverCards[0], ...pageCards, endCards[endCards.length - 1]];
    if (importPlan.length < 2) {
      return NextResponse.json({ error: "Import needs at least cover and end cards" }, { status: 400 });
    }

    const croppedAssets: Array<{ role: CardRole; assetId: string; order: number; width: number | null; height: number | null }> = [];

    for (let i = 0; i < importPlan.length; i++) {
      const card = importPlan[i];
      const { data: extracted, info } = await sharp(sheetBuffer)
        .extract({
          left: card.box.x,
          top: card.box.y,
          width: card.box.width,
          height: card.box.height,
        })
        .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer({ resolveWithObject: true });

      const saved = await saveAssetFromBuffer({
        buffer: extracted,
        originalName: `contact-sheet-crop-${i + 1}.png`,
        mimeType: "image/png",
        width: typeof info.width === "number" ? info.width : undefined,
        height: typeof info.height === "number" ? info.height : undefined,
      });

      croppedAssets.push({
        role: card.role,
        assetId: saved.assetId,
        order: i,
        width: typeof info.width === "number" ? info.width : null,
        height: typeof info.height === "number" ? info.height : null,
      });
    }

    const coverCrop = croppedAssets.find((c) => c.role === "cover") ?? croppedAssets[0] ?? null;
    const importPageAspectRatio =
      coverCrop && coverCrop.width && coverCrop.height && coverCrop.width > 0 && coverCrop.height > 0
        ? coverCrop.width / coverCrop.height
        : null;

    const sourceRows = await db.select().from(storybooks).where(eq(storybooks.id, routeStorybookId)).limit(1);
    const sourceBook = sourceRows[0];
    if (!sourceBook) {
      return NextResponse.json({ error: "Source storybook not found" }, { status: 404 });
    }

    const result = await db.transaction(async (tx) => {
      const slug = `${sanitizeSlugPart(sourceBook.slug)}-imported-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`;
      const title = `${sourceBook.title} Imported`;

      const insertedBook = await tx
        .insert(storybooks)
        .values({
          title,
          slug,
          summary: sourceBook.summary,
          status: "draft",
          coverAssetId: croppedAssets[0]?.assetId ?? null,
          theme:
            sourceBook.theme && typeof sourceBook.theme === "object"
              ? {
                  ...(sourceBook.theme as Record<string, unknown>),
                  ...(importPageAspectRatio ? { pageAspectRatio: importPageAspectRatio } : {}),
                }
              : importPageAspectRatio
                ? { pageAspectRatio: importPageAspectRatio }
                : sourceBook.theme,
        })
        .returning({ id: storybooks.id, slug: storybooks.slug });

      const newBook = insertedBook[0];
      const insertedPages: Array<{ id: string; role: CardRole; position: number }> = [];

      for (let i = 0; i < croppedAssets.length; i++) {
        const crop = croppedAssets[i];
        const pageId = `page-${randomUUID()}`;
        const side: "left" | "right" = i % 2 === 0 ? "left" : "right";
        await tx.insert(pages).values({
          id: pageId,
          storybookId: newBook.id,
          position: i,
          side,
          content: {
            kind: "image",
            assetId: crop.assetId,
            fit: "cover",
            caption: "",
          },
        });
        insertedPages.push({ id: pageId, role: crop.role, position: i });
      }

      const coverPage = insertedPages.find((p) => p.role === "cover");
      const endPage = [...insertedPages].reverse().find((p) => p.role === "end");
      if (!coverPage || !endPage || coverPage.id === endPage.id) {
        throw new Error("Unable to assemble canonical cover/end pages from import plan");
      }

      await tx
        .update(storybooks)
        .set({
          coverPageId: coverPage.id,
          endPageId: endPage.id,
          updatedAt: new Date(),
        })
        .where(eq(storybooks.id, newBook.id));

      return {
        storybookId: newBook.id,
        slug: newBook.slug,
        importedPages: insertedPages.length,
        importedAssets: croppedAssets.length,
      };
    });

    return NextResponse.json({
      ok: true,
      mode: payload.mode,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
