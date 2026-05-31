import { NextResponse } from "next/server";

import { isStudioAuthenticated } from "@/lib/studio-auth";
import { addPage, setStorybookCoverAsset, uploadImageAssetForPage } from "@/lib/studio-service";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function parseBoolean(raw: string | null): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function parseIntField(value: FormDataEntryValue | null): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const num = Number.parseInt(raw, 10);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: storybookId } = await context.params;
  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  // Canonical "Upload Full Book": EVERY image becomes an ordered image page.
  // The first page then becomes the cover and the last the end via the
  // storybook-structure invariants (ensureStorybookStructure runs inside addPage).
  // useFirstAsCover only controls whether image 1 also becomes the library
  // thumbnail (coverAssetId); the page order is what the reader actually uses.
  const useFirstAsCover = parseBoolean(String(formData.get("useFirstAsCover") ?? ""));

  try {
    const createdPageIds: string[] = [];
    let firstPageAssetId: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: `${file.name} exceeds 10MB limit` }, { status: 400 });
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: `${file.name} has unsupported type` }, { status: 400 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());

      // Side alternates left/right for clean spread grouping; canonical order
      // (position) is the source of truth and is normalized inside addPage.
      const side: "left" | "right" = createdPageIds.length % 2 === 0 ? "left" : "right";
      const pageId = await addPage(storybookId, "image", side);
      createdPageIds.push(pageId);

      const { assetId } = await uploadImageAssetForPage({
        storybookId,
        pageId,
        fileName: file.name,
        mimeType: file.type,
        bytes,
        width: parseIntField(formData.get(`w_${i}`)),
        height: parseIntField(formData.get(`h_${i}`)),
        target: "page-image",
      });

      if (i === 0) firstPageAssetId = assetId;
    }

    // Use the first uploaded image as the library thumbnail (coverAssetId).
    if (useFirstAsCover && firstPageAssetId) {
      await setStorybookCoverAsset(storybookId, firstPageAssetId);
    }

    return NextResponse.json({ ok: true, createdPages: createdPageIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

