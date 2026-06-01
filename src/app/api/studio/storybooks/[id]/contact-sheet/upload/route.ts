import sharp from "sharp";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { storybooks } from "@/db/schema";
import { saveAssetFromBuffer } from "@/lib/assets";
import { isStudioAuthenticated } from "@/lib/studio-auth";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: storybookId } = await context.params;
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing upload file" }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image exceeds 10MB limit" }, { status: 400 });
  }

  if (!file.type || !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  const db = getDb();
  const existing = await db
    .select({ id: storybooks.id })
    .from(storybooks)
    .where(eq(storybooks.id, storybookId))
    .limit(1);

  if (!existing[0]) {
    return NextResponse.json({ error: "Storybook not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const meta = await sharp(buffer).metadata();
    const imageWidth = typeof meta.width === "number" ? meta.width : null;
    const imageHeight = typeof meta.height === "number" ? meta.height : null;

    const { assetId } = await saveAssetFromBuffer({
      buffer,
      originalName: file.name,
      mimeType: file.type,
      width: imageWidth ?? undefined,
      height: imageHeight ?? undefined,
    });

    return NextResponse.json({
      sheetAssetId: assetId,
      sheetUrl: `/api/assets/${encodeURIComponent(assetId)}`,
      imageWidth,
      imageHeight,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Contact sheet upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
