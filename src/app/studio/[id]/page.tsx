import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isStudioAuthenticated } from "@/lib/studio-auth";
import {
  addPage,
  deletePage,
  duplicatePage,
  getStudioStorybookById,
  movePageDown,
  movePageUp,
  removePageImage,
  setStorybookStatus,
  type StudioPageRow,
  updatePage,
  updateStorybookDirection,
} from "@/lib/studio-service";
import type { PageContent } from "@/lib/stories/schema";
import { DeletePageForm } from "@/components/studio/delete-page-form";
import { ImageUploadForm } from "@/components/studio/image-upload-form";
import { CoverUploadForm } from "@/components/studio/cover-upload-form";
import { ContactSheetUploadForm } from "@/components/studio/contact-sheet-upload-form";
import { CopyLinkButton } from "@/components/studio/copy-link-button";
import { getAssetUrl } from "@/lib/asset-url";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; mode?: string; reorder?: string; upload?: string; published?: string; saved?: string }>;
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

function pageLabel(index: number, total: number): string {
  if (index === 0) return "Cover";
  if (index === total - 1 && total > 1) return "End";
  return `Page ${index}`;
}

function pageKindIcon(kind: PageContent["kind"]): string {
  if (kind === "text") return "T";
  if (kind === "image") return "I";
  if (kind === "video") return "V";
  return "E";
}

function validationWarning(page: StudioPageRow): string | null {
  if (page.content.kind === "image" && !page.content.assetId) return "Missing image";
  if (page.content.kind === "video" && !page.content.poster) return "Missing poster";
  if (page.content.kind === "embed" && !page.content.poster) return "Missing poster";
  if (page.content.kind === "text" && !page.content.title && !page.content.body) return "This page is empty";
  return null;
}

function assetPreviewUrl(page: StudioPageRow, coverAssetId?: string | null, isCover?: boolean): string | null {
  if (isCover && coverAssetId) return getAssetUrl(coverAssetId);
  if (page.content.kind === "image") return page.content.assetId ? getAssetUrl(page.content.assetId) : null;
  if (page.content.kind === "video") return page.content.poster ? getAssetUrl(page.content.poster) : null;
  if (page.content.kind === "embed") return page.content.poster ? getAssetUrl(page.content.poster) : null;
  return page.content.backgroundAssetId ? getAssetUrl(page.content.backgroundAssetId) : null;
}

function summaryText(page: StudioPageRow): string {
  if (page.content.kind === "text") return page.content.title || page.content.body || "Add text";
  if (page.content.kind === "image") return page.content.caption || "Add image";
  if (page.content.kind === "video") return page.content.poster ? "Video poster page" : "Add poster";
  return page.content.poster ? "Embed poster page" : "Add poster";
}

function languageLabel(direction: "ltr" | "rtl"): "English" | "Hebrew" {
  return direction === "rtl" ? "Hebrew" : "English";
}

function surfacePreview(page: StudioPageRow | null, label: string, coverAssetId?: string | null, isCover?: boolean) {
  if (!page) {
    return <div style={{ color: "#94a3b8", fontSize: 14 }}>No page</div>;
  }
  const preview = assetPreviewUrl(page, coverAssetId, isCover);
  if (preview) {
    return <img src={preview} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  }

  if (page.content.kind === "text") {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: "1rem",
          background: page.content.background || "#ffffff",
          color: page.content.background ? "#ffffff" : "#1f2937",
          display: "grid",
          alignContent: "start",
          gap: "0.5rem",
          overflow: "hidden",
        }}
      >
        {page.content.eyebrow ? <div style={{ fontSize: 11, letterSpacing: ".08em", opacity: 0.7 }}>{page.content.eyebrow.toUpperCase()}</div> : null}
        {page.content.title ? <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{page.content.title}</div> : null}
        <div style={{ fontSize: 14, opacity: 0.95, lineHeight: 1.45 }}>{page.content.body || "This page is empty"}</div>
      </div>
    );
  }

  return <div style={{ color: "#94a3b8", fontSize: 14 }}>{summaryText(page)}</div>;
}

// A single book page rendered as real paper: off-white sheet, soft shadow,
// page-number label, selected glow, and a friendly drop zone when empty.
function BookPage({
  page,
  label,
  selected,
  coverAssetId,
  isCover,
  side,
}: {
  page: StudioPageRow | null;
  label: string;
  selected: boolean;
  coverAssetId?: string | null;
  isCover?: boolean;
  side: "left" | "right" | "single";
}) {
  const empty = !page || (!assetPreviewUrl(page, coverAssetId, isCover) && page.content.kind === "image") ||
    (!!page && page.content.kind === "text" && !page.content.title && !page.content.body && !page.content.backgroundAssetId);
  const radius = side === "left" ? "10px 4px 4px 10px" : side === "right" ? "4px 10px 10px 4px" : "10px";
  return (
    <div
      style={{
        position: "relative",
        background: "#fdfdfb",
        borderRadius: radius,
        boxShadow: selected
          ? "0 0 0 3px #2563eb, 0 10px 28px rgba(15,23,42,.18)"
          : "0 8px 22px rgba(15,23,42,.14)",
        border: "1px solid #ece8df",
        overflow: "hidden",
        aspectRatio: "3 / 4",
        display: "grid",
      }}
    >
      {page && !empty ? (
        <div style={{ width: "100%", height: "100%" }}>{surfacePreview(page, label, coverAssetId, isCover)}</div>
      ) : (
        <div style={{ display: "grid", placeItems: "center", gap: "0.5rem", color: "#9aa3b2", padding: "1rem", textAlign: "center" }}>
          <div style={{ width: 54, height: 54, borderRadius: 12, border: "2px dashed #cbd5e1", display: "grid", placeItems: "center", fontSize: 24 }}>+</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Upload image</div>
          <div style={{ fontSize: 12 }}>or add text in the panel →</div>
        </div>
      )}
      <span
        style={{
          position: "absolute",
          bottom: 8,
          left: side === "right" ? "auto" : 10,
          right: side === "right" ? 10 : "auto",
          fontSize: 11,
          color: "#94a3b8",
          background: "rgba(255,255,255,.7)",
          borderRadius: 6,
          padding: "1px 6px",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function TextEditorFields({
  storybookId,
  page,
  removeImageAction,
  isCover,
  coverAssetId,
}: {
  storybookId: string;
  page: StudioPageRow;
  removeImageAction: (f: FormData) => Promise<void>;
  isCover: boolean;
  coverAssetId?: string | null;
}) {
  if (page.content.kind !== "text") return null;
  const bgAssetId = page.content.backgroundAssetId || "";
  return (
    <>
      <h4 style={{ margin: "0.4rem 0 0", fontSize: 13, color: "#475569" }}>Text</h4>
      <input name="eyebrow" defaultValue={page.content.eyebrow || ""} placeholder="Small label / eyebrow" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }} />
      <input name="title" defaultValue={page.content.title || ""} placeholder={isCover ? "Cover title" : "Page title"} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }} />
      <textarea name="body" defaultValue={page.content.body || ""} placeholder="Page text" rows={6} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }} />

      <h4 style={{ margin: "0.45rem 0 0", fontSize: 13, color: "#475569" }}>Style</h4>
      <select name="align" defaultValue={page.content.align || "left"} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }}>
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
      <input name="background" defaultValue={page.content.background || ""} placeholder="Background color (optional, #RRGGBB)" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }} />

      <h4 style={{ margin: "0.45rem 0 0", fontSize: 13, color: "#475569" }}>{isCover ? "Cover Image" : "Background Image"}</h4>
      {isCover ? (
        <CoverUploadForm storybookId={storybookId} currentAssetId={coverAssetId || ""} />
      ) : (
        <>
          <ImageUploadForm storybookId={storybookId} pageId={page.id} currentAssetId={bgAssetId} target="text-background" fieldName="backgroundAssetId" />
          <select name="backgroundFit" defaultValue={page.content.backgroundFit || "cover"} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }}>
            <option value="cover">cover</option>
            <option value="contain">contain</option>
          </select>
          {bgAssetId ? (
            <button type="submit" formAction={removeImageAction} formNoValidate style={{ padding: "0.55rem 0.7rem", border: "1px solid #ef4444", borderRadius: 8, background: "#fff", color: "#ef4444", cursor: "pointer" }}>
              Remove background image
            </button>
          ) : null}
        </>
      )}
      <input type="hidden" name="backgroundAssetId" defaultValue={bgAssetId} />
    </>
  );
}

function ImageEditorFields({ storybookId, page, removeImageAction }: { storybookId: string; page: StudioPageRow; removeImageAction: (f: FormData) => Promise<void> }) {
  if (page.content.kind !== "image") return null;
  return (
    <>
      <h4 style={{ margin: "0.45rem 0 0", fontSize: 13, color: "#475569" }}>Page Image</h4>
      <ImageUploadForm storybookId={storybookId} pageId={page.id} currentAssetId={page.content.assetId} target="page-image" fieldName="assetId" />
      {/* The asset id is committed by the single Save; the upload fills this in. */}
      <input type="hidden" name="assetId" defaultValue={page.content.assetId} />
      <select name="fit" defaultValue={page.content.fit || "cover"} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }}>
        <option value="cover">cover (fill)</option>
        <option value="contain">contain (fit)</option>
      </select>
      <input name="caption" defaultValue={page.content.caption || ""} placeholder="Caption" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }} />
      {page.content.assetId ? (
        <button type="submit" formAction={removeImageAction} formNoValidate style={{ padding: "0.55rem 0.7rem", border: "1px solid #ef4444", borderRadius: 8, background: "#fff", color: "#ef4444", cursor: "pointer" }}>
          Remove image
        </button>
      ) : null}
    </>
  );
}

function VideoEditorFields({ page }: { page: StudioPageRow }) {
  if (page.content.kind !== "video") return null;
  return (
    <>
      <h4 style={{ margin: "0.45rem 0 0", fontSize: 13, color: "#475569" }}>Video Poster</h4>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Video upload later. Use poster/source now.</p>
      <details>
        <summary style={{ cursor: "pointer", color: "#64748b" }}>Advanced</summary>
        <input name="assetId" defaultValue={page.content.assetId} placeholder="assetId" style={{ marginTop: "0.5rem", width: "100%", padding: "0.55rem", borderRadius: 8, border: "1px dashed #cbd5e1" }} />
        <input name="poster" defaultValue={page.content.poster || ""} placeholder="poster assetId" style={{ marginTop: "0.4rem", width: "100%", padding: "0.55rem", borderRadius: 8, border: "1px dashed #cbd5e1" }} />
        <label style={{ display: "block", marginTop: "0.45rem" }}>autoplay <input name="autoplay" type="checkbox" defaultChecked={page.content.autoplay} /></label>
        <label style={{ display: "block" }}>loop <input name="loop" type="checkbox" defaultChecked={page.content.loop} /></label>
        <label style={{ display: "block" }}>muted <input name="muted" type="checkbox" defaultChecked={page.content.muted} /></label>
      </details>
    </>
  );
}

function EmbedEditorFields({ page }: { page: StudioPageRow }) {
  if (page.content.kind !== "embed") return null;
  return (
    <>
      <h4 style={{ margin: "0.45rem 0 0", fontSize: 13, color: "#475569" }}>Embed Poster</h4>
      <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Embed runtime later. Set poster/source now.</p>
      <details>
        <summary style={{ cursor: "pointer", color: "#64748b" }}>Advanced</summary>
        <select name="sourceType" defaultValue={page.content.source.type} style={{ marginTop: "0.5rem", width: "100%", padding: "0.55rem", borderRadius: 8, border: "1px dashed #cbd5e1" }}>
          <option value="asset">asset</option>
          <option value="url">url</option>
        </select>
        <input name="sourceAssetId" defaultValue={page.content.source.type === "asset" ? page.content.source.assetId : ""} placeholder="source assetId" style={{ marginTop: "0.4rem", width: "100%", padding: "0.55rem", borderRadius: 8, border: "1px dashed #cbd5e1" }} />
        <input name="sourceUrl" defaultValue={page.content.source.type === "url" ? page.content.source.url : ""} placeholder="source URL" style={{ marginTop: "0.4rem", width: "100%", padding: "0.55rem", borderRadius: 8, border: "1px dashed #cbd5e1" }} />
        <input name="poster" defaultValue={page.content.poster} placeholder="poster assetId" style={{ marginTop: "0.4rem", width: "100%", padding: "0.55rem", borderRadius: 8, border: "1px dashed #cbd5e1" }} />
        <label style={{ display: "block", marginTop: "0.45rem" }}>interactive <input name="interactive" type="checkbox" defaultChecked={page.content.interactive} /></label>
      </details>
    </>
  );
}

export default async function StudioStorybookPage({ params, searchParams }: Props) {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) redirect("/studio");

  const { id } = await params;
  const query = await searchParams;

  async function addPageAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const kind = String(formData.get("kind") ?? "text") as "text" | "image" | "video" | "embed";
    // Side is auto-derived from position; new pages land before the End.
    const pageId = await addPage(storybookId, kind, undefined, { insertBeforeEnd: true });
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}?page=${encodeURIComponent(pageId)}`);
  }

  async function updatePageAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    const side = String(formData.get("side") ?? "left") as "left" | "right";
    const kind = String(formData.get("kind") ?? "text") as "text" | "image" | "video" | "embed";

    let content: unknown;
    if (kind === "text") {
      content = {
        kind: "text",
        eyebrow: String(formData.get("eyebrow") ?? "").trim() || undefined,
        title: String(formData.get("title") ?? "").trim() || undefined,
        body: String(formData.get("body") ?? "").trim() || undefined,
        align: String(formData.get("align") ?? "left"),
        background: String(formData.get("background") ?? "").trim() || undefined,
        backgroundAssetId: String(formData.get("backgroundAssetId") ?? "").trim() || undefined,
        backgroundFit: String(formData.get("backgroundFit") ?? "cover"),
      };
    } else if (kind === "image") {
      content = {
        kind: "image",
        assetId: String(formData.get("assetId") ?? "").trim(),
        fit: String(formData.get("fit") ?? "cover"),
        caption: String(formData.get("caption") ?? "").trim() || undefined,
      };
    } else if (kind === "video") {
      content = {
        kind: "video",
        assetId: String(formData.get("assetId") ?? "").trim(),
        poster: String(formData.get("poster") ?? "").trim() || undefined,
        autoplay: parseBoolean(formData.get("autoplay"), true),
        loop: parseBoolean(formData.get("loop"), true),
        muted: parseBoolean(formData.get("muted"), true),
      };
    } else {
      const sourceType = String(formData.get("sourceType") ?? "asset");
      content = {
        kind: "embed",
        source: sourceType === "url" ? { type: "url", url: String(formData.get("sourceUrl") ?? "").trim() } : { type: "asset", assetId: String(formData.get("sourceAssetId") ?? "").trim() },
        poster: String(formData.get("poster") ?? "").trim(),
        interactive: parseBoolean(formData.get("interactive"), true),
      };
    }

    await updatePage({ pageId, side, content });
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}?page=${encodeURIComponent(pageId)}&saved=1`);
  }

  async function deletePageAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await deletePage(pageId);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}`);
  }

  async function duplicatePageAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    const duplicatedId = await duplicatePage(pageId);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    if (duplicatedId) redirect(`/studio/${storybookId}?page=${encodeURIComponent(duplicatedId)}`);
    redirect(`/studio/${storybookId}`);
  }

  async function removePageImageAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await removePageImage({ storybookId, pageId });
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}?page=${encodeURIComponent(pageId)}`);
  }

  async function moveUpAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await movePageUp(pageId);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}?page=${encodeURIComponent(pageId)}`);
  }

  async function moveDownAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await movePageDown(pageId);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}?page=${encodeURIComponent(pageId)}`);
  }

  async function togglePublishAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const nextStatus = String(formData.get("nextStatus") ?? "draft") === "published" ? "published" : "draft";
    await setStorybookStatus(storybookId, nextStatus);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    // Show the "live" success state right after publishing.
    redirect(`/studio/${storybookId}${nextStatus === "published" ? "?published=1" : ""}`);
  }

  const storybook = await getStudioStorybookById(id);
  if (!storybook) {
    return (
      <main style={{ maxWidth: 900, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
        <p>Storybook not found.</p>
        <Link href="/studio">Back to Studio</Link>
      </main>
    );
  }


  // Selection is via ?page=<id> (default: first page). No modal — left list,
  // center book preview, and right editor stay on screen together.
  const selectedId = query.page;
  const selectedIndex = storybook.pages.findIndex((p) => p.id === selectedId);
  const effectiveSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selectedPage = storybook.pages[effectiveSelectedIndex] || null;

  const total = storybook.pages.length;
  const isReorderMode = query.reorder === "1";
  const isAddMode = query.mode === "add";
  const selectedIsCover = effectiveSelectedIndex === 0;
  const selectedIsEnd = effectiveSelectedIndex === total - 1 && total > 1;

  const previewLink = `/api/book/${encodeURIComponent(storybook.slug)}?engine=best&slug=${encodeURIComponent(storybook.slug)}`;
  const publicLink = `https://werbz.com/${storybook.slug}`;
  const nextStatus = storybook.status === "published" ? "draft" : "published";
  const justPublished = query.published === "1" && storybook.status === "published";
  const justSaved = query.saved === "1";

  async function updateBookDirectionAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const direction = String(formData.get("direction") ?? "ltr");
    const pageId = String(formData.get("pageId") ?? "");

    await updateStorybookDirection(storybookId, direction);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath("/api/storybooks");
    redirect(`/studio/${storybookId}${pageId ? `?page=${encodeURIComponent(pageId)}` : ""}`);
  }

  // Center preview: cover and end are single pages; a story page shows the open
  // spread it belongs to. Middle pages are indices 1..total-2, paired (1,2),(3,4)...
  let spreadLeftIdx = -1;
  let spreadRightIdx = -1;
  if (!selectedIsCover && !selectedIsEnd && total > 1) {
    const middlePos = effectiveSelectedIndex - 1; // 0-based within middle pages
    const pair = Math.floor(middlePos / 2);
    spreadLeftIdx = 1 + pair * 2;
    spreadRightIdx = spreadLeftIdx + 1;
    if (spreadRightIdx > total - 2) spreadRightIdx = -1; // odd tail: no right page
  }

  const selectStyle = { padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" } as const;

  return (
    <main style={{ maxWidth: 1640, margin: "0 auto", minHeight: "100vh", padding: "1rem 1.2rem", fontFamily: "system-ui, sans-serif", color: "#0f172a", background: "#f6f7fb" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem" }}>
          <Link href="/studio" style={{ padding: "0.45rem 0.7rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit", background: "#fff", fontSize: 13 }}>← Studio</Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>{storybook.title}</h1>
            <p style={{ margin: "0.2rem 0 0", color: "#64748b", fontSize: 13 }}>{storybook.status === "published" ? "Published" : "Draft"} • {languageLabel(storybook.direction)} • {storybook.direction.toUpperCase()} • {total} pages</p>
          </div>
          <span style={{ background: storybook.status === "published" ? "#d1fae5" : "#f1f5f9", color: storybook.status === "published" ? "#065f46" : "#475569", borderRadius: 999, padding: "0.2rem 0.6rem", fontSize: 12, fontWeight: 700 }}>
            {storybook.status === "published" ? "Published" : "Draft"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href={previewLink} target="_blank" style={{ padding: "0.55rem 0.85rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit", background: "#fff", fontWeight: 600 }}>Preview Book</Link>
          <form action={togglePublishAction}>
            <input type="hidden" name="storybookId" value={storybook.id} />
            <input type="hidden" name="nextStatus" value={nextStatus} />
            <button type="submit" style={{ padding: "0.55rem 0.95rem", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
              {storybook.status === "published" ? "Unpublish" : "Publish"}
            </button>
          </form>
          {storybook.status === "published" ? <CopyLinkButton url={publicLink} /> : null}
        </div>
      </header>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: "0.9rem 1rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "0.3rem" }}>Book Settings</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Book language / direction</div>
          <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: 13 }}>Use this to classify books into English/LTR or Hebrew/RTL across Studio and the public library.</p>
        </div>
        <form action={updateBookDirectionAction} style={{ display: "flex", gap: "0.55rem", alignItems: "end", flexWrap: "wrap" }}>
          <input type="hidden" name="storybookId" value={storybook.id} />
          <input type="hidden" name="pageId" value={selectedPage?.id || ""} />
          <label style={{ display: "grid", gap: "0.25rem", fontSize: 13, color: "#374151" }}>
            Language
            <select name="direction" defaultValue={storybook.direction} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5", minWidth: 240 }}>
              <option value="ltr">English — Left to Right</option>
              <option value="rtl">Hebrew — Right to Left</option>
            </select>
          </label>
          <button type="submit" style={{ padding: "0.6rem 0.95rem", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
            Save
          </button>
        </form>
      </section>

      {justPublished ? (
        <section style={{ border: "1px solid #6ee7b7", background: "#ecfdf5", borderRadius: 12, padding: "0.9rem 1rem", marginBottom: "1rem" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#065f46" }}>Your storybook is live 🎉</div>
          <p style={{ margin: "0.3rem 0 0.7rem", color: "#047857", fontSize: 13 }}>Share the reading link with family, or preview it first.</p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <CopyLinkButton url={publicLink} />
            <Link href={previewLink} target="_blank" style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", textDecoration: "none", color: "inherit" }}>Preview Book</Link>
            <button type="button" disabled title="Coming soon" style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }}>Send to Grandma</button>
            <button type="button" disabled title="Coming soon" style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }}>Schedule Reading Time</button>
          </div>
        </section>
      ) : null}

      {total === 0 ? (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: "1.4rem", maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Start your storybook</h2>
          <p style={{ color: "#64748b" }}>Import one or more contact-sheet PNGs, or add your first page manually.</p>
          <ContactSheetUploadForm storybookId={storybook.id} />
          <form action={addPageAction} style={{ marginTop: "0.8rem" }}>
            <input type="hidden" name="storybookId" value={storybook.id} />
            <input type="hidden" name="kind" value="text" />
            <button type="submit" style={{ padding: "0.6rem 0.9rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Add a text page</button>
          </form>
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0, 1fr) 360px", gap: "1rem", alignItems: "start" }}>
          {/* LEFT: page list */}
          <aside style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: "0.7rem", position: "sticky", top: "1rem" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", margin: "0.1rem 0 0.6rem" }}>Pages</div>
            <div style={{ display: "grid", gap: "0.4rem", maxHeight: "62vh", overflow: "auto", paddingRight: 2 }}>
              {storybook.pages.map((page, index) => {
                const selected = page.id === selectedPage?.id;
                const thumb = assetPreviewUrl(page, storybook.coverAssetId, index === 0);
                const warn = validationWarning(page);
                const label = pageLabel(index, total);
                return (
                  <div key={page.id} style={{ border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 10, padding: "0.4rem", background: selected ? "#eff6ff" : "#fff" }}>
                    <Link href={`/studio/${storybook.id}?page=${encodeURIComponent(page.id)}`} style={{ display: "flex", gap: "0.55rem", alignItems: "center", textDecoration: "none", color: "inherit" }}>
                      {/* The thumbnail takes the image's real shape: fixed width, auto height
                          (clamped) so square crops look square, wide look wide, tall look tall. */}
                      <div style={{ width: 52, minHeight: 40, maxHeight: 84, borderRadius: 6, border: "1px solid #cbd5e1", overflow: "hidden", background: "#f8fafc", display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {thumb ? <img src={thumb} alt="" style={{ width: "100%", height: "auto", maxHeight: 84, objectFit: "contain", display: "block" }} /> : <span style={{ fontSize: 18, color: "#94a3b8", padding: "0.6rem 0" }}>{pageKindIcon(page.content.kind)}</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                        {warn ? <div style={{ fontSize: 11, color: "#b45309" }}>{warn}</div> : null}
                      </div>
                    </Link>
                    {isReorderMode && index > 0 && index < total - 1 ? (
                      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                        <form action={moveUpAction}>
                          <input type="hidden" name="storybookId" value={storybook.id} />
                          <input type="hidden" name="pageId" value={page.id} />
                          <button type="submit" title="Move earlier" style={{ padding: "0.25rem 0.55rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>◀</button>
                        </form>
                        <form action={moveDownAction}>
                          <input type="hidden" name="storybookId" value={storybook.id} />
                          <input type="hidden" name="pageId" value={page.id} />
                          <button type="submit" title="Move later" style={{ padding: "0.25rem 0.55rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>▶</button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: "0.7rem", display: "grid", gap: "0.5rem" }}>
              <Link href={`/studio/${storybook.id}?mode=add`} style={{ padding: "0.55rem", borderRadius: 8, border: "1px solid #d1d5db", textAlign: "center", fontWeight: 700, textDecoration: "none", color: "inherit", background: "#fff" }}>+ Add Page</Link>
              <Link href={`/studio/${storybook.id}?upload=1${selectedPage ? `&page=${encodeURIComponent(selectedPage.id)}` : ""}`} style={{ padding: "0.55rem", borderRadius: 8, border: "1px solid #d1d5db", textAlign: "center", fontWeight: 600, textDecoration: "none", color: "inherit", background: "#fff" }}>Upload Full Book</Link>
              <Link href={`/studio/${storybook.id}?reorder=${isReorderMode ? "0" : "1"}${selectedPage ? `&page=${encodeURIComponent(selectedPage.id)}` : ""}`} style={{ padding: "0.5rem", borderRadius: 8, border: "1px solid #d1d5db", textAlign: "center", textDecoration: "none", color: "inherit", background: isReorderMode ? "#eff6ff" : "#fff" }}>{isReorderMode ? "Done Reordering" : "Reorder Pages"}</Link>
            </div>
          </aside>

          {/* CENTER: book preview */}
          <section style={{ display: "grid", placeItems: "center", padding: "1rem 0.5rem", minHeight: "60vh" }}>
            {selectedIsCover || selectedIsEnd ? (
              <div style={{ width: "min(420px, 70%)" }}>
                <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: "0.6rem" }}>{selectedIsCover ? "Front Cover" : "Back Cover / End"}</div>
                <BookPage page={selectedPage} label={selectedIsCover ? "Cover" : "End"} selected coverAssetId={storybook.coverAssetId} isCover={selectedIsCover} side="single" />
              </div>
            ) : (
              <div style={{ width: "min(900px, 100%)" }}>
                <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: "0.6rem" }}>Open Spread</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: "linear-gradient(90deg,#e9e6dd,#cfcabd,#e9e6dd)", borderRadius: 12, padding: 2 }}>
                  <BookPage
                    page={spreadLeftIdx >= 0 ? storybook.pages[spreadLeftIdx] : null}
                    label={spreadLeftIdx >= 0 ? pageLabel(spreadLeftIdx, total) : ""}
                    selected={spreadLeftIdx === effectiveSelectedIndex}
                    coverAssetId={storybook.coverAssetId}
                    side="left"
                  />
                  <BookPage
                    page={spreadRightIdx >= 0 ? storybook.pages[spreadRightIdx] : null}
                    label={spreadRightIdx >= 0 ? pageLabel(spreadRightIdx, total) : ""}
                    selected={spreadRightIdx === effectiveSelectedIndex}
                    coverAssetId={storybook.coverAssetId}
                    side="right"
                  />
                </div>
              </div>
            )}
          </section>

          {/* RIGHT: editor for the selected page */}
          <aside style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: "0.9rem", position: "sticky", top: "1rem" }}>
            {selectedPage ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h2 style={{ margin: "0 0 0.2rem", fontSize: 18 }}>{selectedIsCover ? "Editing Cover" : selectedIsEnd ? "Editing End" : `Editing ${pageLabel(effectiveSelectedIndex, total)}`}</h2>
                  {justSaved ? <span style={{ fontSize: 12, color: "#059669", fontWeight: 700 }}>Saved ✓</span> : null}
                </div>
                <p style={{ margin: "0 0 0.8rem", color: "#64748b", fontSize: 13 }}>One Save commits this page&apos;s text and image together.</p>
                <form action={updatePageAction} style={{ display: "grid", gap: "0.6rem" }}>
                  <input type="hidden" name="storybookId" value={storybook.id} />
                  <input type="hidden" name="pageId" value={selectedPage.id} />
                  <input type="hidden" name="kind" value={selectedPage.content.kind} />
                  <input type="hidden" name="side" value={selectedPage.side} />
                  <TextEditorFields storybookId={storybook.id} page={selectedPage} removeImageAction={removePageImageAction} isCover={selectedIsCover} coverAssetId={storybook.coverAssetId} />
                  <ImageEditorFields storybookId={storybook.id} page={selectedPage} removeImageAction={removePageImageAction} />
                  <VideoEditorFields page={selectedPage} />
                  <EmbedEditorFields page={selectedPage} />
                  <button type="submit" style={{ marginTop: "0.3rem", padding: "0.8rem", borderRadius: 9, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>Save</button>
                </form>
                <div style={{ borderTop: "1px solid #e5e7eb", marginTop: "0.85rem", paddingTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
                  <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>Page Actions</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                    <form action={duplicatePageAction}>
                      <input type="hidden" name="storybookId" value={storybook.id} />
                      <input type="hidden" name="pageId" value={selectedPage.id} />
                      <button type="submit" style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Duplicate</button>
                    </form>
                    {!selectedIsCover && !selectedIsEnd ? (
                      <>
                        <form action={moveUpAction}>
                          <input type="hidden" name="storybookId" value={storybook.id} />
                          <input type="hidden" name="pageId" value={selectedPage.id} />
                          <button type="submit" style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Move Before</button>
                        </form>
                        <form action={moveDownAction}>
                          <input type="hidden" name="storybookId" value={storybook.id} />
                          <input type="hidden" name="pageId" value={selectedPage.id} />
                          <button type="submit" style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Move After</button>
                        </form>
                      </>
                    ) : null}
                    <DeletePageForm storybookId={storybook.id} pageId={selectedPage.id} action={deletePageAction} />
                  </div>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      )}

      {isAddMode ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", zIndex: 70, display: "grid", placeItems: "center", padding: "1.2rem" }}>
          <div style={{ width: "min(440px, 100%)", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,.28)", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Add Page</h2>
              <Link href={`/studio/${storybook.id}`} style={{ padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", color: "inherit" }}>Close</Link>
            </div>
            <form action={addPageAction} style={{ display: "grid", gap: "0.65rem" }}>
              <input type="hidden" name="storybookId" value={storybook.id} />
              <label style={{ display: "grid", gap: "0.3rem", fontSize: 13 }}>
                Page type
                <select name="kind" defaultValue="text" style={selectStyle}>
                  <option value="text">Text page</option>
                  <option value="image">Image page</option>
                  <option value="video">Video poster page</option>
                  <option value="embed">Embed poster page</option>
                </select>
              </label>
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>New pages are added before the End and arranged into spreads automatically.</p>
              <button type="submit" style={{ marginTop: "0.35rem", padding: "0.7rem", borderRadius: 9, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Create Page</button>
            </form>
          </div>
        </div>
      ) : null}

      {query.upload === "1" ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", zIndex: 70, display: "grid", placeItems: "center", padding: "1.2rem" }}>
          <div style={{ width: "min(1400px, 100%)", minHeight: "84vh", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,.28)", padding: "1rem", display: "grid", gridTemplateRows: "auto 1fr" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Upload Full Book</h2>
              <Link href={`/studio/${storybook.id}${selectedPage ? `?page=${encodeURIComponent(selectedPage.id)}` : ""}`} style={{ padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", color: "inherit" }}>Close</Link>
            </div>
            <ContactSheetUploadForm storybookId={storybook.id} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
