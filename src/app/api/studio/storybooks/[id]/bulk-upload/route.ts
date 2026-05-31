import { NextResponse } from "next/server";

import { isStudioAuthenticated } from "@/lib/studio-auth";
import { addPage, uploadCoverAssetForStorybook, uploadImageAssetForPage } from "@/lib/studio-service";

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

  const useFirstAsCover = parseBoolean(String(formData.get("useFirstAsCover") ?? ""));
  const useLastAsEnd = parseBoolean(String(formData.get("useLastAsEnd") ?? ""));

  try {
    const createdPageIds: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: `${file.name} exceeds 10MB limit` }, { status: 400 });
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: `${file.name} has unsupported type` }, { status: 400 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());
      const isFirst = i === 0;
      const isLast = i === files.length - 1;

      if (useFirstAsCover && isFirst) {
        await uploadCoverAssetForStorybook({
          storybookId,
          fileName: file.name,
          mimeType: file.type,
          bytes,
          width: parseIntField(formData.get(`w_${i}`)),
          height: parseIntField(formData.get(`h_${i}`)),
        });
        continue;
      }

      const side: "left" | "right" = createdPageIds.length % 2 === 0 ? "left" : "right";
      const pageId = await addPage(storybookId, "image", side);
      createdPageIds.push(pageId);

      await uploadImageAssetForPage({
        storybookId,
        pageId,
        fileName: file.name,
        mimeType: file.type,
        bytes,
        width: parseIntField(formData.get(`w_${i}`)),
        height: parseIntField(formData.get(`h_${i}`)),
        target: "page-image",
      });

      if (useLastAsEnd && isLast) {
        // No dedicated back-cover schema yet; this marks the final page with caption.
        // The editor labels the final page as End/Back Cover.
      }
    }

    return NextResponse.json({ ok: true, createdPages: createdPageIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bulk upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

