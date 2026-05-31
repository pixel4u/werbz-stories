import { readFileSync } from "node:fs";
import { join } from "node:path";

import { NextResponse } from "next/server";

// Single source of truth for the reader's Pixi runtime. The engine HTML files
// (specs/best.html, specs/book-engine-v30.html) load Pixi from this route, which
// serves the version-pinned copy committed at public/pixi-7.4.3.min.js. Keep this
// the only way the reader gets Pixi — no CDN, no separate node_modules copy.
const PIXI_FILE = join(process.cwd(), "public", "pixi-7.4.3.min.js");

export async function GET() {
  const source = readFileSync(PIXI_FILE, "utf8");
  return new NextResponse(source, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
