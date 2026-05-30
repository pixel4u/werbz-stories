import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { assets } from "@/db/schema";

interface Params {
  params: Promise<{ assetId: string }>;
}

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

function renderPlaceholder() {
  // Clean, reader-facing placeholder for a missing image: a neutral book-paper
  // panel with a soft, generic picture glyph. Deliberately contains NO text and
  // NO asset id — those are developer details that must never appear in the
  // public reader. (The book engine surfaces ids only in its debug overlay.)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f6f5f1" />
      <stop offset="100%" stop-color="#e9e7e0" />
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)" />
  <g opacity="0.55">
    <rect x="470" y="300" width="260" height="200" rx="16" ry="16" fill="none" stroke="#b7b2a7" stroke-width="6" />
    <circle cx="540" cy="362" r="20" fill="#b7b2a7" />
    <path d="M484 486 L560 414 L612 466 L668 402 L716 470 L716 482 Q716 492 706 492 L494 492 Q484 492 484 482 Z" fill="#b7b2a7" />
  </g>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}

export async function GET(_: Request, { params }: Params) {
  const { assetId } = await params;
  const db = getDb();

  const rows = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  const asset = rows[0];
  if (!asset) {
    return renderPlaceholder();
  }

  try {
    const filePath = join(uploadsDir(), asset.storageKey);
    const bytes = await readFile(filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": asset.mimeType,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return renderPlaceholder();
  }
}
