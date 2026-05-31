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
} from "@/lib/studio-service";
import type { PageContent } from "@/lib/stories/schema";
import { DeletePageForm } from "@/components/studio/delete-page-form";
import { ImageUploadForm } from "@/components/studio/image-upload-form";
import { CoverUploadForm } from "@/components/studio/cover-upload-form";
import { BulkUploadForm } from "@/components/studio/bulk-upload-form";
import { CopyLinkButton } from "@/components/studio/copy-link-button";
import { getAssetUrl } from "@/lib/assets";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; mode?: string; reorder?: string; upload?: string; published?: string }>;
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
          <ImageUploadForm storybookId={storybookId} pageId={page.id} currentAssetId={bgAssetId} target="text-background" />
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
      <ImageUploadForm storybookId={storybookId} pageId={page.id} currentAssetId={page.content.assetId} target="page-image" />
      <select name="fit" defaultValue={page.content.fit || "cover"} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }}>
        <option value="cover">cover</option>
        <option value="contain">contain</option>
      </select>
      <input name="caption" defaultValue={page.content.caption || ""} placeholder="Caption" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }} />
      {page.content.assetId ? (
        <button type="submit" formAction={removeImageAction} formNoValidate style={{ padding: "0.55rem 0.7rem", border: "1px solid #ef4444", borderRadius: 8, background: "#fff", color: "#ef4444", cursor: "pointer" }}>
          Remove image
        </button>
      ) : null}
      <details>
        <summary style={{ cursor: "pointer", color: "#64748b" }}>Advanced</summary>
        <input name="assetId" defaultValue={page.content.assetId} placeholder="assetId" style={{ marginTop: "0.5rem", width: "100%", padding: "0.55rem", borderRadius: 8, border: "1px dashed #cbd5e1" }} />
      </details>
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
    redirect(`/studio/${storybookId}?mode=edit&page=${encodeURIComponent(pageId)}`);
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
    redirect(`/studio/${storybookId}?mode=edit&page=${encodeURIComponent(pageId)}`);
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
    if (duplicatedId) redirect(`/studio/${storybookId}?mode=edit&page=${encodeURIComponent(duplicatedId)}`);
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
    redirect(`/studio/${storybookId}?mode=edit&page=${encodeURIComponent(pageId)}`);
  }

  async function moveUpAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await movePageUp(pageId);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}?mode=edit&page=${encodeURIComponent(pageId)}`);
  }

  async function moveDownAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await movePageDown(pageId);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}?mode=edit&page=${encodeURIComponent(pageId)}`);
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

  const selectedId = query.page;
  const selectedIndex = storybook.pages.findIndex((p) => p.id === selectedId);
  const effectiveSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selectedPage = storybook.pages[effectiveSelectedIndex] || null;

  const isEditMode = query.mode === "edit" && !!selectedPage;
  const isReorderMode = query.reorder === "1";

  const selectedIsCover = effectiveSelectedIndex === 0;
  const selectedIsEnd = effectiveSelectedIndex === storybook.pages.length - 1 && storybook.pages.length > 1;
  const isAddMode = query.mode === "add";

  const previewLink = `/api/book/${encodeURIComponent(storybook.slug)}?engine=best&slug=${encodeURIComponent(storybook.slug)}`;
  const publicLink = `https://werbz.com/${storybook.slug}`;
  const nextStatus = storybook.status === "published" ? "draft" : "published";
  const justPublished = query.published === "1" && storybook.status === "published";

  const selectedSpreadLeft =
    selectedPage && !selectedIsCover && !selectedIsEnd
      ? selectedPage.side === "left"
        ? selectedPage
        : storybook.pages[effectiveSelectedIndex - 1] ?? null
      : null;
  const selectedSpreadRight =
    selectedPage && !selectedIsCover && !selectedIsEnd
      ? selectedPage.side === "right"
        ? selectedPage
        : storybook.pages[effectiveSelectedIndex + 1] ?? null
      : null;

  return (
    <main style={{ maxWidth: 1560, margin: "1rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>{storybook.title}</h1>
          <p style={{ margin: "0.35rem 0 0", color: "#475569" }}>{storybook.status === "published" ? "Published" : "Draft"} • {storybook.pageCount} pages</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href={previewLink} target="_blank" style={{ padding: "0.55rem 0.85rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit" }}>Preview Book</Link>
          <form action={togglePublishAction}>
            <input type="hidden" name="storybookId" value={storybook.id} />
            <input type="hidden" name="nextStatus" value={nextStatus} />
            <button type="submit" style={{ padding: "0.55rem 0.85rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
              {storybook.status === "published" ? "Unpublish" : "Publish"}
            </button>
          </form>
          {storybook.status === "published" ? <CopyLinkButton url={publicLink} /> : null}
          <Link href="/studio" style={{ padding: "0.55rem 0.85rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit" }}>Back to Studio</Link>
        </div>
      </header>

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

      {storybook.pages.length === 0 ? (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: "1.2rem" }}>
          <h2 style={{ marginTop: 0 }}>Start your storybook</h2>
          <p style={{ color: "#64748b" }}>Upload all pages at once, or add your first page manually.</p>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 520px)", gap: "0.8rem" }}>
            <BulkUploadForm storybookId={storybook.id} />
            <details>
              <summary style={{ cursor: "pointer", padding: "0.6rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", width: 170, textAlign: "center", fontWeight: 700 }}>
                Add First Page
              </summary>
              <form action={addPageAction} style={{ display: "grid", gap: "0.5rem", marginTop: "0.55rem", maxWidth: 300 }}>
                <input type="hidden" name="storybookId" value={storybook.id} />
                <select name="kind" defaultValue="text" style={{ padding: "0.55rem" }}>
                  <option value="text">Text page</option>
                  <option value="image">Image page</option>
                  <option value="video">Video page</option>
                  <option value="embed">Embed page</option>
                </select>
                <button type="submit" style={{ padding: "0.55rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Create page</button>
              </form>
            </details>
          </div>
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "330px minmax(760px, 1fr)", gap: "1rem", alignItems: "start" }}>
          <aside style={{ position: "sticky", top: 10 }}>
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "0.75rem" }}>
              <h3 style={{ margin: "0 0 0.6rem", fontSize: 14 }}>Pages</h3>
              <div style={{ display: "grid", gap: "0.45rem", maxHeight: "72vh", overflow: "auto", paddingRight: 4 }}>
                {storybook.pages.map((page, index) => {
                  const selected = selectedPage?.id === page.id;
                  const thumb = assetPreviewUrl(page, storybook.coverAssetId, index === 0);
                  const warn = validationWarning(page);
                  const label = pageLabel(index, storybook.pages.length);
                  return (
                    <div key={page.id} style={{ border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 10, padding: "0.45rem", background: selected ? "#eff6ff" : "#fff" }}>
                      <Link href={`/studio/${storybook.id}?mode=edit&page=${encodeURIComponent(page.id)}`} style={{ display: "flex", gap: "0.55rem", alignItems: "center", textDecoration: "none", color: "inherit" }}>
                        <div style={{ width: 58, height: 78, borderRadius: 6, border: "1px solid #cbd5e1", overflow: "hidden", background: "#f8fafc", display: "grid", placeItems: "center" }}>
                          {thumb ? <img src={thumb} alt="thumb" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22, color: "#94a3b8" }}>{pageKindIcon(page.content.kind)}</span>}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                          {warn ? <div style={{ fontSize: 11, color: "#b45309" }}>{warn}</div> : null}
                        </div>
                      </Link>

                      {isReorderMode && index > 0 && index < storybook.pages.length - 1 ? (
                        <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                          <form action={moveUpAction}>
                            <input type="hidden" name="storybookId" value={storybook.id} />
                            <input type="hidden" name="pageId" value={page.id} />
                            <button type="submit" style={{ padding: "0.3rem 0.6rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>◀</button>
                          </form>
                          <form action={moveDownAction}>
                            <input type="hidden" name="storybookId" value={storybook.id} />
                            <input type="hidden" name="pageId" value={page.id} />
                            <button type="submit" style={{ padding: "0.3rem 0.6rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>▶</button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: "0.7rem", display: "grid", gap: "0.55rem" }}>
                <Link
                  href={`/studio/${storybook.id}?mode=add`}
                  style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db", textAlign: "center", fontWeight: 700, textDecoration: "none", color: "inherit" }}
                >
                  + Add Page
                </Link>

                <div style={{ border: "1px solid #dbe3ef", borderRadius: 8, padding: "0.6rem" }}>
                  <strong style={{ fontSize: 13 }}>Upload Full Book</strong>
                  <p style={{ margin: "0.3rem 0 0.5rem", fontSize: 12, color: "#64748b" }}>
                    First image → Cover, last image → End, middle images → story pages.
                  </p>
                  <BulkUploadForm storybookId={storybook.id} />
                </div>

                <Link
                  href={`/studio/${storybook.id}?reorder=${isReorderMode ? "0" : "1"}`}
                  style={{ textAlign: "center", padding: "0.55rem", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", color: "inherit" }}
                >
                  {isReorderMode ? "Done Reordering" : "Reorder Pages"}
                </Link>
              </div>
            </section>
          </aside>

          <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "0.9rem" }}>
            <h3 style={{ margin: "0 0 0.7rem", fontSize: 14 }}>Book Timeline</h3>

            <div style={{ display: "grid", gap: "0.8rem" }}>
              {selectedPage ? (
                <div style={{ border: "1px solid #dbe3ef", borderRadius: 12, padding: "0.8rem", background: "#f8fbff" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: "0.45rem" }}>
                    {selectedIsCover ? "Selected: Cover" : selectedIsEnd ? "Selected: End" : `Selected Spread • ${pageLabel(effectiveSelectedIndex, storybook.pages.length)}`}
                  </div>
                  {selectedIsCover || selectedIsEnd ? (
                    <div style={{ height: 340, borderRadius: 10, border: "1px solid #dbe3ef", overflow: "hidden", background: "#fff", display: "grid", placeItems: "center" }}>
                      {surfacePreview(selectedPage, pageLabel(effectiveSelectedIndex, storybook.pages.length), storybook.coverAssetId, selectedIsCover)}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                      <div style={{ borderRadius: 10, border: "1px solid #dbe3ef", background: "#fff", minHeight: 300, overflow: "hidden", display: "grid", placeItems: "center" }}>
                        {selectedSpreadLeft ? surfacePreview(selectedSpreadLeft, "Left page", storybook.coverAssetId, false) : <span style={{ color: "#94a3b8" }}>Left page empty</span>}
                      </div>
                      <div style={{ borderRadius: 10, border: "1px solid #dbe3ef", background: "#fff", minHeight: 300, overflow: "hidden", display: "grid", placeItems: "center" }}>
                        {selectedSpreadRight ? surfacePreview(selectedSpreadRight, "Right page", storybook.coverAssetId, false) : <span style={{ color: "#94a3b8" }}>Right page empty</span>}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "0.8rem", background: "#fafafa" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: "0.45rem" }}>Cover</div>
                <div style={{ height: 280, borderRadius: 10, border: "1px solid #dbe3ef", overflow: "hidden", background: "#fff", display: "grid", placeItems: "center" }}>
                  {surfacePreview(storybook.pages[0] || null, "Cover", storybook.coverAssetId, true)}
                </div>
              </div>

              {Array.from({ length: Math.ceil(Math.max(0, storybook.pages.length - 2) / 2) }).map((_, spreadIdx) => {
                const base = 1 + spreadIdx * 2;
                const left = storybook.pages[base] || null;
                const right = storybook.pages[base + 1] || null;
                return (
                  <div key={`spread-${spreadIdx}`} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "0.8rem", background: "#fafafa" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: "0.45rem" }}>Spread {spreadIdx + 1}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem" }}>
                      <div style={{ borderRadius: 10, border: "1px solid #dbe3ef", background: "#fff", minHeight: 260, overflow: "hidden", display: "grid", placeItems: "center" }}>
                        {left ? surfacePreview(left, pageLabel(base, storybook.pages.length), storybook.coverAssetId, false) : <span style={{ color: "#94a3b8" }}>Empty</span>}
                      </div>
                      <div style={{ borderRadius: 10, border: "1px solid #dbe3ef", background: "#fff", minHeight: 260, overflow: "hidden", display: "grid", placeItems: "center" }}>
                        {right ? surfacePreview(right, pageLabel(base + 1, storybook.pages.length), storybook.coverAssetId, false) : <span style={{ color: "#94a3b8" }}>Empty</span>}
                      </div>
                    </div>
                  </div>
                );
              })}

              {storybook.pages.length > 1 ? (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "0.8rem", background: "#fafafa" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: "0.45rem" }}>End</div>
                  <div style={{ height: 280, borderRadius: 10, border: "1px solid #dbe3ef", overflow: "hidden", background: "#fff", display: "grid", placeItems: "center" }}>
                    {surfacePreview(storybook.pages[storybook.pages.length - 1] || null, "End", storybook.coverAssetId, false)}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      )}

      {isEditMode && selectedPage ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", zIndex: 70, display: "grid", placeItems: "center", padding: "1.2rem" }}>
          <div style={{ width: "min(1280px, 100%)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,.28)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.9rem 1rem", borderBottom: "1px solid #e5e7eb" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>{selectedIsCover ? "Editing Cover" : selectedIsEnd ? "Editing End Page" : `Editing ${pageLabel(effectiveSelectedIndex, storybook.pages.length)}`}</h2>
                <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: 13 }}>{summaryText(selectedPage)}</p>
              </div>
              <Link href={`/studio/${storybook.id}?page=${encodeURIComponent(selectedPage.id)}`} style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", color: "inherit" }}>
                Done
              </Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(520px, 1fr) 380px", gap: "1rem", padding: "1rem" }}>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, background: "#fafafa", padding: "0.8rem" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: "0.45rem" }}>Page Preview</div>
                <div style={{ height: 560, borderRadius: 10, border: "1px solid #dbe3ef", overflow: "hidden", background: "#fff", display: "grid", placeItems: "center" }}>
                  {surfacePreview(selectedPage, pageLabel(effectiveSelectedIndex, storybook.pages.length), storybook.coverAssetId, selectedIsCover)}
                </div>
              </div>

              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "0.85rem" }}>
                <form action={updatePageAction} style={{ display: "grid", gap: "0.6rem" }}>
                  <input type="hidden" name="storybookId" value={storybook.id} />
                  <input type="hidden" name="pageId" value={selectedPage.id} />
                  <input type="hidden" name="kind" value={selectedPage.content.kind} />
                  <input type="hidden" name="side" value={selectedPage.side} />

                  <TextEditorFields storybookId={storybook.id} page={selectedPage} removeImageAction={removePageImageAction} isCover={selectedIsCover} coverAssetId={storybook.coverAssetId} />
                  <ImageEditorFields storybookId={storybook.id} page={selectedPage} removeImageAction={removePageImageAction} />
                  <VideoEditorFields page={selectedPage} />
                  <EmbedEditorFields page={selectedPage} />

                  <button type="submit" style={{ marginTop: "0.4rem", padding: "0.7rem", borderRadius: 9, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                    Save Page
                  </button>
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
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isAddMode ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", zIndex: 70, display: "grid", placeItems: "center", padding: "1.2rem" }}>
          <div style={{ width: "min(460px, 100%)", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,.28)", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Add Page</h2>
              <Link href={`/studio/${storybook.id}`} style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", color: "inherit" }}>
                Close
              </Link>
            </div>
            <form action={addPageAction} style={{ display: "grid", gap: "0.65rem" }}>
              <input type="hidden" name="storybookId" value={storybook.id} />
              <label style={{ display: "grid", gap: "0.3rem", fontSize: 13 }}>
                Page type
                <select name="kind" defaultValue="text" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d6dce5" }}>
                  <option value="text">Text page</option>
                  <option value="image">Image page</option>
                  <option value="video">Video poster page</option>
                  <option value="embed">Embed poster page</option>
                </select>
              </label>
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>New pages are added before the End and arranged into spreads automatically.</p>
              <button type="submit" style={{ marginTop: "0.35rem", padding: "0.7rem", borderRadius: 9, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                Create Page
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
