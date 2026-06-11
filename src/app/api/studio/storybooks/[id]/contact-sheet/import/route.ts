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

interface ImportSheetInput {
  sheetAssetId: string;
  cards: ImportCardInput[];
}

interface ImportPayload {
  sheets?: ImportSheetInput[];
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
  function parseCards(input: unknown, prefix: string): ImportCardInput[] {
    if (!Array.isArray(input) || input.length === 0) throw new Error(`${prefix} cards are required`);
    if (input.length > MAX_IMPORT_CARDS) throw new Error(`Too many cards in ${prefix}`);
    return input.map((card, idx) => {
      if (!card || typeof card !== "object") throw new Error(`Invalid card at ${prefix} index ${idx}`);
      const c = card as Partial<ImportCardInput>;
      const role = c.role;
      if (role !== "cover" && role !== "page" && role !== "end") throw new Error(`Invalid role at ${prefix} card ${idx}`);
      const orderRaw = c.order ?? idx;
      const order = Number.isFinite(Number(orderRaw)) ? Number(orderRaw) : idx;
      const box = c.box;
      if (!box || typeof box !== "object") throw new Error(`Invalid box at ${prefix} card ${idx}`);
      const boxObj = box as Record<string, unknown>;
      const x = Math.round(Number(boxObj.x));
      const y = Math.round(Number(boxObj.y));
      const width = Math.round(Number(boxObj.width));
      const height = Math.round(Number(boxObj.height));
      if (![x, y, width, height].every(Number.isFinite)) throw new Error(`Invalid box numbers at ${prefix} card ${idx}`);
      return { box: { x, y, width, height }, order, role };
    });
  }

  const sheetsRaw = Array.isArray(raw.sheets) ? raw.sheets : null;
  const sheets: ImportSheetInput[] =
    sheetsRaw && sheetsRaw.length > 0
      ? sheetsRaw.map((sheet, idx) => {
          if (!sheet || typeof sheet !== "object") throw new Error(`Invalid sheet at index ${idx}`);
          const candidate = sheet as Partial<ImportSheetInput>;
          const sheetAssetId = String(candidate.sheetAssetId ?? "").trim();
          if (!sheetAssetId) throw new Error(`sheetAssetId is required for sheet ${idx + 1}`);
          return {
            sheetAssetId,
            cards: parseCards(candidate.cards, `sheet ${idx + 1}`),
          };
        })
      : (() => {
          const sheetAssetId = String(raw.sheetAssetId ?? "").trim();
          if (!sheetAssetId) throw new Error("sheetAssetId is required");
          return [
            {
              sheetAssetId,
              cards: parseCards(raw.cards, "request"),
            },
          ];
        })();

  const totalCards = sheets.reduce((sum, sheet) => sum + sheet.cards.length, 0);
  if (totalCards > MAX_IMPORT_CARDS) throw new Error("Too many cards");

  const mode: ImportMode = raw.mode === "replace" || raw.mode === "append" ? raw.mode : "new";
  const targetStorybookId = raw.targetStorybookId ? String(raw.targetStorybookId).trim() : undefined;
  return {
    sheetAssetId: sheets[0]?.sheetAssetId ?? "",
    cards: sheets[0]?.cards ?? [],
    sheets,
    mode,
    targetStorybookId,
  };
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
    const sheetInputs = payload.sheets && payload.sheets.length > 0 ? payload.sheets : [{ sheetAssetId: payload.sheetAssetId, cards: payload.cards }];
    const preparedSheets: Array<{
      sheetAssetId: string;
      sheetBuffer: Buffer;
      sortedCards: ImportCardInput[];
    }> = [];

    for (const input of sheetInputs) {
      const sheetRows = await db.select().from(assets).where(eq(assets.id, input.sheetAssetId)).limit(1);
      const sheet = sheetRows[0];
      if (!sheet) {
        return NextResponse.json({ error: `Sheet asset not found: ${input.sheetAssetId}` }, { status: 404 });
      }

      if (!ALLOWED_IMAGE_MIME_TYPES.has(sheet.mimeType)) {
        return NextResponse.json({ error: `Sheet asset is not a supported image: ${input.sheetAssetId}` }, { status: 400 });
      }

      const sheetPath = join(uploadsDir(), sheet.storageKey);
      const sheetBuffer = await readFile(sheetPath);
      const sheetMeta = await sharp(sheetBuffer).metadata();
      const sheetWidth = sheetMeta.width ?? null;
      const sheetHeight = sheetMeta.height ?? null;
      if (!sheetWidth || !sheetHeight) {
        return NextResponse.json({ error: `Could not read source image dimensions for ${input.sheetAssetId}` }, { status: 400 });
      }

      const sortedCards = sortImportCards(input.cards);
      validateBoxesWithinBounds(sortedCards, sheetWidth, sheetHeight);
      preparedSheets.push({
        sheetAssetId: input.sheetAssetId,
        sheetBuffer,
        sortedCards,
      });
    }

    const allCards = preparedSheets.flatMap((sheet) => sheet.sortedCards);
    const coverCards = allCards.filter((c) => c.role === "cover");
    const endCards = allCards.filter((c) => c.role === "end");
    if (coverCards.length !== 1) {
      return NextResponse.json({ error: `Import requires exactly 1 cover card, found ${coverCards.length}` }, { status: 400 });
    }
    if (endCards.length !== 1) {
      return NextResponse.json({ error: `Import requires exactly 1 end card, found ${endCards.length}` }, { status: 400 });
    }

    const importPlan = preparedSheets.flatMap((sheet) => sheet.sortedCards).filter((c) => c.role === "cover" || c.role === "page" || c.role === "end");
    if (importPlan.length < 2) {
      return NextResponse.json({ error: "Import needs at least cover and end cards" }, { status: 400 });
    }

    const croppedAssets: Array<{ role: CardRole; assetId: string; order: number; width: number | null; height: number | null }> = [];

    for (let i = 0; i < preparedSheets.length; i++) {
      const preparedSheet = preparedSheets[i];
      for (let j = 0; j < preparedSheet.sortedCards.length; j++) {
        const card = preparedSheet.sortedCards[j];
        const outputIndex = croppedAssets.length;
        const { data: extracted, info } = await sharp(preparedSheet.sheetBuffer)
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
          originalName: `contact-sheet-crop-${outputIndex + 1}.png`,
          mimeType: "image/png",
          width: typeof info.width === "number" ? info.width : undefined,
          height: typeof info.height === "number" ? info.height : undefined,
        });

        croppedAssets.push({
          role: card.role,
          assetId: saved.assetId,
          order: outputIndex,
          width: typeof info.width === "number" ? info.width : null,
          height: typeof info.height === "number" ? info.height : null,
        });
      }
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
