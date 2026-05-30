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

function renderPlaceholder(assetId: string) {
  const safe = assetId.replace(/[^a-zA-Z0-9-_]/g, "_");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8e6df" />
      <stop offset="100%" stop-color="#cfc9bc" />
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)" />
  <rect x="60" y="60" width="1080" height="680" rx="28" ry="28" fill="rgba(255,255,255,0.55)" stroke="rgba(40,40,40,0.2)" />
  <text x="100" y="170" fill="#2a2a2a" font-size="54" font-family="Georgia, serif" font-weight="700">Asset Placeholder</text>
  <text x="100" y="250" fill="#3a3a3a" font-size="38" font-family="Helvetica, Arial, sans-serif">${safe}</text>
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
    return renderPlaceholder(assetId);
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
    return renderPlaceholder(assetId);
  }
}
