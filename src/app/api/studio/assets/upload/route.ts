import { NextResponse } from "next/server";

import { isStudioAuthenticated } from "@/lib/studio-auth";
import { uploadImageAssetForPage } from "@/lib/studio-service";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function parseIntField(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const num = Number.parseInt(raw, 10);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

export async function POST(request: Request) {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const storybookId = String(formData.get("storybookId") ?? "").trim();
  const pageId = String(formData.get("pageId") ?? "").trim();
  const file = formData.get("file");

  if (!storybookId || !pageId || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing upload fields" }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image exceeds 10MB limit" }, { status: 400 });
  }

  if (!file.type || file.type === "image/svg+xml") {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const result = await uploadImageAssetForPage({
      storybookId,
      pageId,
      fileName: file.name,
      mimeType: file.type,
      bytes,
      width: parseIntField(formData.get("width")),
      height: parseIntField(formData.get("height")),
    });

    return NextResponse.json({ ok: true, assetId: result.assetId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
