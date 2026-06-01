import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { getDb } from "@/db/client";
import { assets } from "@/db/schema";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "uploads");
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  return extname(mimeType) || ".bin";
}

export async function saveAssetFromBuffer(input: {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  width?: number;
  height?: number;
}): Promise<{ assetId: string; storageKey: string }> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error("Unsupported image type");
  }

  void input.originalName;

  const db = getDb();
  const assetId = `asset-upload-${randomUUID()}`;
  const ext = extensionForMimeType(input.mimeType);
  const storageKey = `${assetId}${ext}`;
  const dir = uploadsDir();

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, storageKey), input.buffer);

  await db.insert(assets).values({
    id: assetId,
    storageKey,
    mimeType: input.mimeType,
    bytes: input.buffer.length,
    width: input.width ?? null,
    height: input.height ?? null,
  });

  return { assetId, storageKey };
}
