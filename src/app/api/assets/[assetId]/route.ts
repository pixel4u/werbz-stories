import { NextResponse } from "next/server";

interface Params {
  params: Promise<{ assetId: string }>;
}

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 60% 42%)`;
}

export async function GET(_: Request, { params }: Params) {
  const { assetId } = await params;
  const safe = assetId.replace(/[^a-zA-Z0-9-_]/g, "_");
  const bg = colorForId(safe);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)" />
  <rect x="60" y="60" width="1080" height="680" rx="28" ry="28" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" />
  <text x="100" y="170" fill="white" font-size="54" font-family="Georgia, serif" font-weight="700">Asset Placeholder</text>
  <text x="100" y="250" fill="rgba(255,255,255,0.92)" font-size="38" font-family="Helvetica, Arial, sans-serif">${safe}</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
