import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

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
  searchParams: Promise<{ page?: string }>;
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

function pageKindIcon(kind: PageContent["kind"]): string {
  if (kind === "text") return "T";
  if (kind === "image") return "I";
  if (kind === "video") return "V";
  return "E";
}

function pageLabel(index: number, total: number): string {
  if (index === 0) return "Cover";
  if (index === total - 1 && total > 1) return "End";
  return `Page ${index}`;
}

function assetPreviewUrl(page: StudioPageRow): string | null {
  if (page.content.kind === "image") return page.content.assetId ? getAssetUrl(page.content.assetId) : null;
  if (page.content.kind === "video") return page.content.poster ? getAssetUrl(page.content.poster) : null;
  if (page.content.kind === "embed") return page.content.poster ? getAssetUrl(page.content.poster) : null;
  return page.content.backgroundAssetId ? getAssetUrl(page.content.backgroundAssetId) : null;
}

function contentSummary(content: PageContent): string {
  if (content.kind === "text") return content.title || content.body || "Text page";
  if (content.kind === "image") return content.caption || "Image page";
  if (content.kind === "video") return content.poster ? `Poster: ${content.poster}` : "Video poster page";
  return content.poster ? `Poster: ${content.poster}` : "Embed poster page";
}

function validationWarning(page: StudioPageRow): string | null {
  if (page.content.kind === "image" && !page.content.assetId) return "Missing image";
  if (page.content.kind === "video" && !page.content.poster) return "Missing poster";
  if (page.content.kind === "embed" && !page.content.poster) return "Missing poster";
  if (page.content.kind === "text" && !page.content.title && !page.content.body) return "Empty text";
  return null;
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: "0.75rem" }}>
      <h3 style={{ margin: "0 0 0.65rem", fontSize: 14 }}>{title}</h3>
      {children}
    </section>
  );
}

function PageSurfacePreview({ page, label }: { page: StudioPageRow | null; label: string }) {
  if (!page) {
    return <div style={{ padding: "1rem", color: "#94a3b8" }}>Empty</div>;
  }

  const preview = assetPreviewUrl(page);
  const kind = page.content.kind;

  if (preview) {
    return <img src={preview} alt={label} style={{ width: "100%", height: 340, objectFit: "cover" }} />;
  }

  if (kind === "text") {
    return (
      <div
        style={{
          width: "100%",
          height: 340,
          background: page.content.background || "#ffffff",
          color: page.content.background ? "#ffffff" : "#1f2937",
          padding: "1rem",
          overflow: "hidden",
          display: "grid",
          alignContent: "start",
          gap: "0.45rem",
        }}
      >
        {page.content.eyebrow ? <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase" }}>{page.content.eyebrow}</div> : null}
        {page.content.title ? <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{page.content.title}</div> : null}
        <div style={{ fontSize: 14, lineHeight: 1.4, opacity: 0.92 }}>{page.content.body || "No body text yet"}</div>
      </div>
    );
  }

  return <div style={{ padding: "1rem", color: "#94a3b8" }}>{contentSummary(page.content)}</div>;
}

function TextFields({ storybookId, page, removeImageAction, isCover }: { storybookId: string; page: StudioPageRow; removeImageAction: (f: FormData) => Promise<void>; isCover: boolean }) {
  const bgAssetId = page.content.kind === "text" ? page.content.backgroundAssetId || "" : "";
  if (page.content.kind !== "text") return null;
  return (
    <>
      <input name="eyebrow" defaultValue={page.content.eyebrow || ""} placeholder="Eyebrow" style={{ padding: "0.5rem" }} />
      <input name="title" defaultValue={page.content.title || ""} placeholder={isCover ? "Cover title" : "Title"} style={{ padding: "0.5rem" }} />
      <textarea name="body" defaultValue={page.content.body || ""} placeholder="Body" rows={6} style={{ padding: "0.5rem" }} />
      <select name="align" defaultValue={page.content.align || "left"} style={{ padding: "0.5rem" }}>
        <option value="left">left</option>
        <option value="center">center</option>
        <option value="right">right</option>
      </select>
      <input name="background" defaultValue={page.content.background || ""} placeholder="Background hex (optional)" style={{ padding: "0.5rem" }} />
      <ImageUploadForm storybookId={storybookId} pageId={page.id} currentAssetId={bgAssetId} target="text-background" />
      <input type="hidden" name="backgroundAssetId" defaultValue={bgAssetId} />
      <select name="backgroundFit" defaultValue={page.content.backgroundFit || "cover"} style={{ padding: "0.5rem" }}>
        <option value="cover">cover</option>
        <option value="contain">contain</option>
      </select>
      {bgAssetId ? (
        <button type="submit" formAction={removeImageAction} formNoValidate style={{ padding: "0.45rem 0.7rem", border: "1px solid #ef4444", borderRadius: 8, background: "#fff", color: "#ef4444", cursor: "pointer" }}>
          Remove background image
        </button>
      ) : null}
    </>
  );
}

function ImageFields({ storybookId, page, removeImageAction }: { storybookId: string; page: StudioPageRow; removeImageAction: (f: FormData) => Promise<void> }) {
  if (page.content.kind !== "image") return null;
  return (
    <>
      <ImageUploadForm storybookId={storybookId} pageId={page.id} currentAssetId={page.content.assetId} target="page-image" />
      <select name="fit" defaultValue={page.content.fit || "cover"} style={{ padding: "0.5rem" }}>
        <option value="cover">cover</option>
        <option value="contain">contain</option>
      </select>
      <input name="caption" defaultValue={page.content.caption || ""} placeholder="Caption" style={{ padding: "0.5rem" }} />
      {page.content.assetId ? (
        <button type="submit" formAction={removeImageAction} formNoValidate style={{ padding: "0.45rem 0.7rem", border: "1px solid #ef4444", borderRadius: 8, background: "#fff", color: "#ef4444", cursor: "pointer" }}>
          Remove image
        </button>
      ) : null}
      <details>
        <summary style={{ cursor: "pointer", color: "#64748b" }}>Advanced</summary>
        <input name="assetId" defaultValue={page.content.assetId} placeholder="Manual assetId" style={{ padding: "0.5rem", marginTop: "0.5rem", width: "100%" }} />
      </details>
    </>
  );
}

function VideoFields({ page }: { page: StudioPageRow }) {
  if (page.content.kind !== "video") return null;
  return (
    <>
      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Video uploads coming soon. Configure poster and source now.</p>
      <label>autoplay <input name="autoplay" type="checkbox" defaultChecked={page.content.autoplay} /></label>
      <label>loop <input name="loop" type="checkbox" defaultChecked={page.content.loop} /></label>
      <label>muted <input name="muted" type="checkbox" defaultChecked={page.content.muted} /></label>
      <details>
        <summary style={{ cursor: "pointer", color: "#64748b" }}>Advanced</summary>
        <input name="assetId" defaultValue={page.content.assetId} placeholder="assetId" style={{ padding: "0.5rem", marginTop: "0.5rem", width: "100%" }} />
        <input name="poster" defaultValue={page.content.poster || ""} placeholder="poster assetId" style={{ padding: "0.5rem", marginTop: "0.4rem", width: "100%" }} />
      </details>
    </>
  );
}

function EmbedFields({ page }: { page: StudioPageRow }) {
  if (page.content.kind !== "embed") return null;
  return (
    <>
      <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>Embed runtime comes later. Configure poster/source now.</p>
      <label>interactive <input name="interactive" type="checkbox" defaultChecked={page.content.interactive} /></label>
      <details>
        <summary style={{ cursor: "pointer", color: "#64748b" }}>Advanced</summary>
        <select name="sourceType" defaultValue={page.content.source.type} style={{ padding: "0.5rem", marginTop: "0.5rem", width: "100%" }}>
          <option value="asset">asset</option>
          <option value="url">url</option>
        </select>
        <input name="sourceAssetId" defaultValue={page.content.source.type === "asset" ? page.content.source.assetId : ""} placeholder="source assetId" style={{ padding: "0.5rem", marginTop: "0.4rem", width: "100%" }} />
        <input name="sourceUrl" defaultValue={page.content.source.type === "url" ? page.content.source.url : ""} placeholder="source URL" style={{ padding: "0.5rem", marginTop: "0.4rem", width: "100%" }} />
        <input name="poster" defaultValue={page.content.poster} placeholder="poster assetId" style={{ padding: "0.5rem", marginTop: "0.4rem", width: "100%" }} />
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
    const side = String(formData.get("side") ?? "right") as "left" | "right";

    await addPage(storybookId, kind, side);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}`);
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
    redirect(`/studio/${storybookId}?page=${encodeURIComponent(pageId)}`);
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
    if (duplicatedId) {
      redirect(`/studio/${storybookId}?page=${encodeURIComponent(duplicatedId)}`);
    }
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
    redirect(`/studio/${storybookId}`);
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
  const selectedIndex = Math.max(0, storybook.pages.findIndex((p) => p.id === selectedId));
  const effectiveSelectedIndex = selectedId && selectedIndex >= 0 ? selectedIndex : 0;
  const selectedPage = storybook.pages[effectiveSelectedIndex] || null;
  const selectedIsCover = effectiveSelectedIndex === 0;
  const selectedIsEnd = effectiveSelectedIndex === storybook.pages.length - 1 && storybook.pages.length > 1;
  const leftPage = selectedPage?.side === "right" ? null : selectedPage;
  const rightPage = selectedPage?.side === "right" ? selectedPage : null;
  const previewLink = `/${storybook.slug}`;
  const publicLink = `https://werbz.com/${storybook.slug}`;
  const nextStatus = storybook.status === "published" ? "draft" : "published";

  return (
    <main style={{ maxWidth: 1600, margin: "1rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>{storybook.title}</h1>
          <p style={{ margin: "0.3rem 0 0", color: "#475569" }}>Slug: <code>{storybook.slug}</code></p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, borderRadius: 999, padding: "0.25rem 0.6rem", background: storybook.status === "published" ? "#dcfce7" : "#f1f5f9", color: storybook.status === "published" ? "#166534" : "#334155" }}>
            {storybook.status}
          </span>
          <span style={{ fontSize: 12, color: "#64748b" }}>Saved</span>
          <Link href={previewLink} target="_blank" style={{ padding: "0.5rem 0.8rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit" }}>Preview Book</Link>
          <form action={togglePublishAction}>
            <input type="hidden" name="storybookId" value={storybook.id} />
            <input type="hidden" name="nextStatus" value={nextStatus} />
            <button type="submit" style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
              {storybook.status === "published" ? "Unpublish" : "Publish"}
            </button>
          </form>
          {storybook.status === "published" ? <CopyLinkButton url={publicLink} /> : null}
          <Link href="/studio" style={{ padding: "0.5rem 0.8rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit" }}>Back to Studio</Link>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "320px minmax(580px, 1fr) 380px", gap: "1rem", alignItems: "start" }}>
        <aside style={{ position: "sticky", top: 12 }}>
          <SectionCard title="Pages">
            <div style={{ display: "grid", gap: "0.45rem", maxHeight: "68vh", overflow: "auto", paddingRight: 4 }}>
              {storybook.pages.map((page, index) => {
                const selected = selectedPage?.id === page.id;
                const warn = validationWarning(page);
                const thumb = assetPreviewUrl(page);
                return (
                  <Link
                    key={page.id}
                    href={`/studio/${storybook.id}?page=${encodeURIComponent(page.id)}`}
                    style={{
                      border: selected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      borderRadius: 10,
                      padding: "0.45rem",
                      textDecoration: "none",
                      color: "inherit",
                      background: selected ? "#eff6ff" : "#fff",
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <div style={{ width: 58, height: 78, borderRadius: 6, border: "1px solid #cbd5e1", overflow: "hidden", background: "#f8fafc", display: "grid", placeItems: "center" }}>
                        {thumb ? <img src={thumb} alt="thumb" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 22, color: "#94a3b8" }}>{pageKindIcon(page.content.kind)}</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{pageLabel(index, storybook.pages.length)}</div>
                        <div style={{ fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{page.content.kind}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contentSummary(page.content)}</div>
                        {warn ? <div style={{ fontSize: 11, color: "#b45309" }}>{warn}</div> : null}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
            <details style={{ marginTop: "0.65rem" }}>
              <summary
                style={{
                  listStyle: "none",
                  cursor: "pointer",
                  padding: "0.6rem",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  textAlign: "center",
                  fontWeight: 700,
                }}
              >
                Add Page
              </summary>
              <form action={addPageAction} style={{ display: "grid", gap: "0.5rem", marginTop: "0.55rem" }}>
                <input type="hidden" name="storybookId" value={storybook.id} />
                <select name="kind" defaultValue="text" style={{ padding: "0.5rem" }}>
                  <option value="text">Text page</option>
                  <option value="image">Image page</option>
                  <option value="video">Video page</option>
                  <option value="embed">Embed page</option>
                </select>
                <select name="side" defaultValue="right" style={{ padding: "0.5rem" }}>
                  <option value="left">left spread</option>
                  <option value="right">right spread</option>
                </select>
                <button type="submit" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                  Create Page
                </button>
              </form>
            </details>
            <div style={{ marginTop: "0.65rem" }}>
              <BulkUploadForm storybookId={storybook.id} />
            </div>
          </SectionCard>
        </aside>

        <section style={{ display: "grid", gap: "1rem" }}>
          <SectionCard title="Selected Page Preview">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "stretch" }}>
              {[leftPage, rightPage].map((page, slot) => {
                if (!page) {
                  return <div key={`blank-${slot}`} style={{ border: "1px dashed #cbd5e1", borderRadius: 10, minHeight: 420, background: "#f8fafc" }} />;
                }
                const idx = storybook.pages.findIndex((p) => p.id === page.id);
                const label = pageLabel(idx, storybook.pages.length);
                return (
                  <div key={page.id} style={{ border: "1px solid #dbe3ef", borderRadius: 10, minHeight: 420, padding: "0.5rem", background: "#fff", display: "grid", gridTemplateRows: "auto 1fr auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#334155" }}>
                      <strong>{label}</strong>
                      <span>{page.side}</span>
                    </div>
                    <div style={{ marginTop: "0.45rem", borderRadius: 8, border: "1px solid #e2e8f0", overflow: "hidden", background: "#f8fafc", display: "grid", placeItems: "center" }}>
                      <PageSurfacePreview page={page} label={label} />
                    </div>
                    <p style={{ margin: "0.55rem 0 0", fontSize: 12, color: "#64748b" }}>{contentSummary(page.content)}</p>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.7rem" }}>
              <Link
                href={`/studio/${storybook.id}?page=${encodeURIComponent(storybook.pages[Math.max(0, effectiveSelectedIndex - 1)]?.id || storybook.pages[0]?.id || "")}`}
                style={{ padding: "0.45rem 0.7rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit" }}
              >
                Previous Page
              </Link>
              <Link
                href={`/studio/${storybook.id}?page=${encodeURIComponent(storybook.pages[Math.min(storybook.pages.length - 1, effectiveSelectedIndex + 1)]?.id || storybook.pages[0]?.id || "")}`}
                style={{ padding: "0.45rem 0.7rem", border: "1px solid #d1d5db", borderRadius: 8, textDecoration: "none", color: "inherit" }}
              >
                Next Page
              </Link>
            </div>
          </SectionCard>

          <SectionCard title="Cover / End">
            <CoverUploadForm storybookId={storybook.id} currentAssetId={storybook.coverAssetId || ""} />
          </SectionCard>
        </section>

        <aside style={{ position: "sticky", top: 12 }}>
          <SectionCard title="Page Inspector">
            {selectedPage ? (
              <>
                <p style={{ margin: "0 0 0.55rem", color: "#475569", fontSize: 13 }}>
                  {pageLabel(effectiveSelectedIndex, storybook.pages.length)} • <code>{selectedPage.id}</code>
                </p>
                <form action={updatePageAction} style={{ display: "grid", gap: "0.55rem" }}>
                  <input type="hidden" name="storybookId" value={storybook.id} />
                  <input type="hidden" name="pageId" value={selectedPage.id} />
                  <input type="hidden" name="kind" value={selectedPage.content.kind} />
                  {selectedIsCover || selectedIsEnd ? (
                    <>
                      <input type="hidden" name="side" value={selectedPage.side} />
                      <p style={{ margin: 0, padding: "0.5rem", borderRadius: 8, background: "#f8fafc", fontSize: 13, color: "#475569" }}>
                        {selectedIsCover ? "Cover page" : "End page"} uses standalone layout. Side is automatic.
                      </p>
                    </>
                  ) : (
                    <select name="side" defaultValue={selectedPage.side} style={{ padding: "0.5rem" }}>
                      <option value="left">left</option>
                      <option value="right">right</option>
                    </select>
                  )}

                  <TextFields storybookId={storybook.id} page={selectedPage} removeImageAction={removePageImageAction} isCover={selectedIsCover} />
                  <ImageFields storybookId={storybook.id} page={selectedPage} removeImageAction={removePageImageAction} />
                  <VideoFields page={selectedPage} />
                  <EmbedFields page={selectedPage} />

                  <button type="submit" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontWeight: 700 }}>
                    Save Page
                  </button>
                </form>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
                  <form action={moveUpAction}>
                    <input type="hidden" name="storybookId" value={storybook.id} />
                    <input type="hidden" name="pageId" value={selectedPage.id} />
                    <button type="submit" style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Move Up</button>
                  </form>
                  <form action={moveDownAction}>
                    <input type="hidden" name="storybookId" value={storybook.id} />
                    <input type="hidden" name="pageId" value={selectedPage.id} />
                    <button type="submit" style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Move Down</button>
                  </form>
                  <form action={duplicatePageAction}>
                    <input type="hidden" name="storybookId" value={storybook.id} />
                    <input type="hidden" name="pageId" value={selectedPage.id} />
                    <button type="submit" style={{ padding: "0.5rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>Duplicate</button>
                  </form>
                  <DeletePageForm storybookId={storybook.id} pageId={selectedPage.id} action={deletePageAction} />
                </div>
              </>
            ) : (
              <p>No pages yet. Add your first page.</p>
            )}
          </SectionCard>
        </aside>
      </div>
    </main>
  );
}
