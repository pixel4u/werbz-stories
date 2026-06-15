import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createStorybook,
  deleteStorybook,
  duplicateStorybook,
  listStudioStorybooks,
  setStorybookStatus,
  updateStorybookMeta,
} from "@/lib/studio-service";
import { DeleteStorybookForm } from "@/components/studio/delete-storybook-form";
import { CoverUploadForm } from "@/components/studio/cover-upload-form";
import { getAssetUrl } from "@/lib/asset-url";

export const dynamic = "force-dynamic";

interface StudioPageProps {
  searchParams?: Promise<{ edit?: string; lang?: string }>;
}

function normalizeLang(value: string | undefined): "all" | "english" | "hebrew" {
  if (value === "english" || value === "hebrew") return value;
  return "all";
}

function studioHref(lang: "all" | "english" | "hebrew", editId?: string | null): string {
  const params = new URLSearchParams();
  if (lang !== "all") params.set("lang", lang);
  if (editId) params.set("edit", editId);
  const query = params.toString();
  return query ? `/studio?${query}` : "/studio";
}

function languageLabel(direction: "ltr" | "rtl"): "English" | "Hebrew" {
  return direction === "rtl" ? "Hebrew" : "English";
}

function directionLabel(direction: "ltr" | "rtl"): "RTL" | "LTR" {
  return direction === "rtl" ? "RTL" : "LTR";
}

async function createStorybookAction() {
  "use server";
  const storybookId = await createStorybook();
  revalidatePath("/studio");
  redirect(`/studio/${storybookId}`);
}

async function updateStorybookAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const summary = String(formData.get("summary") ?? "");
  const status = (String(formData.get("status") ?? "draft") === "published" ? "published" : "draft") as "draft" | "published";
  const coverAssetId = String(formData.get("coverAssetId") ?? "");
  const direction = (String(formData.get("direction") ?? "ltr") === "rtl" ? "rtl" : "ltr") as "ltr" | "rtl";
  const lang = normalizeLang(String(formData.get("returnLang") ?? ""));

  await updateStorybookMeta({ id, title, slug, summary, status, coverAssetId, direction });
  revalidatePath("/studio");
  revalidatePath(`/studio/${id}`);
  revalidatePath(`/api/storybooks`);
  redirect(studioHref(lang));
}

async function togglePublishAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const nextStatus = (String(formData.get("nextStatus") ?? "draft") === "published" ? "published" : "draft") as "draft" | "published";
  const lang = normalizeLang(String(formData.get("returnLang") ?? ""));
  await setStorybookStatus(id, nextStatus);
  revalidatePath("/studio");
  revalidatePath(`/studio/${id}`);
  redirect(studioHref(lang));
}

async function duplicateStorybookAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const lang = normalizeLang(String(formData.get("returnLang") ?? ""));
  await duplicateStorybook(id);
  revalidatePath("/studio");
  redirect(studioHref(lang));
}

async function deleteStorybookAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  await deleteStorybook(id);
  revalidatePath("/studio");
  redirect("/studio");
}

function StatusBadge({ status }: { status: "draft" | "published" }) {
  const bg = status === "published" ? "#d1fae5" : "#f3f4f6";
  const fg = status === "published" ? "#065f46" : "#374151";
  return (
    <span style={{ background: bg, color: fg, borderRadius: 999, padding: "0.2rem 0.6rem", fontSize: 11, fontWeight: 700 }}>
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ border: "1px solid #dbe3ef", background: "#f8fafc", color: "#475569", borderRadius: 999, padding: "0.18rem 0.55rem", fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function isPlaceholderCoverAsset(assetId: string | null): boolean {
  return !!assetId && assetId.startsWith("asset-cover-");
}

export default async function StudioPage({ searchParams }: StudioPageProps) {
  const books = await listStudioStorybooks();
  const query = searchParams ? await searchParams : undefined;
  const activeLang = normalizeLang(query?.lang);
  const activeEditId = query?.edit ?? null;
  const filteredBooks =
    activeLang === "hebrew"
      ? books.filter((book) => book.direction === "rtl")
      : activeLang === "english"
        ? books.filter((book) => book.direction !== "rtl")
        : books;
  const editingBook = activeEditId ? books.find((book) => book.id === activeEditId) ?? null : null;

  return (
    <main style={{ maxWidth: 1520, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Studio</h1>
          <p style={{ margin: "0.35rem 0 0", color: "#6b7280" }}>Manage storybooks, metadata, publishing, and page editing.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/studio/analytics" style={{ padding: "0.6rem 1rem", border: "1px solid #ddd", borderRadius: 8, textDecoration: "none", color: "inherit", background: "#fff" }}>
            Analytics
          </Link>
          <form action={createStorybookAction}>
            <button type="submit" style={{ padding: "0.6rem 1rem", cursor: "pointer", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700 }}>
              Add New Storybook
            </button>
          </form>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <Link href={studioHref("all")} style={{ padding: "0.45rem 0.85rem", borderRadius: 999, border: activeLang === "all" ? "1px solid #2563eb" : "1px solid #d1d5db", background: activeLang === "all" ? "#eff6ff" : "#fff", color: activeLang === "all" ? "#1d4ed8" : "#334155", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
          All Books
        </Link>
        <Link href={studioHref("english")} style={{ padding: "0.45rem 0.85rem", borderRadius: 999, border: activeLang === "english" ? "1px solid #2563eb" : "1px solid #d1d5db", background: activeLang === "english" ? "#eff6ff" : "#fff", color: activeLang === "english" ? "#1d4ed8" : "#334155", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
          English
        </Link>
        <Link href={studioHref("hebrew")} style={{ padding: "0.45rem 0.85rem", borderRadius: 999, border: activeLang === "hebrew" ? "1px solid #2563eb" : "1px solid #d1d5db", background: activeLang === "hebrew" ? "#eff6ff" : "#fff", color: activeLang === "hebrew" ? "#1d4ed8" : "#334155", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
          Hebrew
        </Link>
        <span style={{ fontSize: 12, color: "#64748b" }}>Language tabs are driven by each book&apos;s reading direction.</span>
      </div>

      {filteredBooks.length === 0 ? (
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff", padding: "1.25rem" }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>No books in this view yet</h2>
          <p style={{ margin: 0, color: "#64748b" }}>Create a storybook or switch to another language filter.</p>
        </section>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {filteredBooks.map((book) => {
            const coverUrl = book.coverAssetId ? getAssetUrl(book.coverAssetId) : null;
            const nextStatus = book.status === "published" ? "draft" : "published";
            return (
              <article
                key={book.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  overflow: "hidden",
                  background: "#fff",
                  boxShadow: "0 1px 8px rgba(15,23,42,0.04)",
                  display: "grid",
                }}
              >
                <div style={{ aspectRatio: "4 / 5", background: coverUrl ? "#e2e8f0" : "linear-gradient(135deg, #e2e8f0, #f8fafc)", overflow: "hidden", display: "grid", placeItems: "center" }}>
                  {coverUrl ? <img src={coverUrl} alt={book.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span style={{ color: "#94a3b8", fontWeight: 700, fontSize: 13 }}>No cover</span>}
                </div>
                <div style={{ padding: "0.85rem", display: "grid", gap: "0.65rem" }}>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <StatusBadge status={book.status} />
                    <MetaChip>{languageLabel(book.direction)}</MetaChip>
                    <MetaChip>{directionLabel(book.direction)}</MetaChip>
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.25 }}>{book.title}</h2>
                    <p style={{ margin: "0.3rem 0 0", fontSize: 12, color: "#64748b" }}>
                      {book.pageCount} pages • updated {new Date(book.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                    <Link href={`/studio/${book.id}`} style={{ flex: 1, minWidth: 0, padding: "0.55rem 0.7rem", textAlign: "center", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", textDecoration: "none", fontWeight: 700 }}>
                      Open Editor
                    </Link>
                    <Link href={studioHref(activeLang, book.id)} style={{ flex: 1, minWidth: 0, padding: "0.55rem 0.7rem", textAlign: "center", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#0f172a", textDecoration: "none", fontWeight: 600 }}>
                      Edit Metadata
                    </Link>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    <Link
                      href={`/api/book/${encodeURIComponent(book.slug)}?engine=best&slug=${encodeURIComponent(book.slug)}`}
                      target="_blank"
                      style={{ fontSize: 12, color: "#334155", textDecoration: "none", border: "1px solid #e5e7eb", borderRadius: 999, padding: "0.25rem 0.55rem" }}
                    >
                      Preview
                    </Link>
                    <form action={togglePublishAction}>
                      <input type="hidden" name="id" value={book.id} />
                      <input type="hidden" name="nextStatus" value={nextStatus} />
                      <input type="hidden" name="returnLang" value={activeLang} />
                      <button type="submit" style={{ fontSize: 12, padding: "0.25rem 0.55rem", borderRadius: 999, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}>
                        {book.status === "published" ? "Unpublish" : "Publish"}
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editingBook ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", zIndex: 70, display: "grid", placeItems: "center", padding: "1.2rem" }}>
          <div style={{ width: "min(760px, 100%)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(15,23,42,.28)", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", marginBottom: "0.8rem" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20 }}>Edit Metadata</h2>
                <p style={{ margin: "0.25rem 0 0", fontSize: 13, color: "#64748b" }}>{editingBook.title}</p>
              </div>
              <Link href={studioHref(activeLang)} style={{ padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", color: "inherit", background: "#fff" }}>
                Close
              </Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: "1rem", alignItems: "start" }}>
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ aspectRatio: "4 / 5", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f8fafc", display: "grid", placeItems: "center" }}>
                  {editingBook.coverAssetId ? <img src={getAssetUrl(editingBook.coverAssetId)} alt={editingBook.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700 }}>No cover</span>}
                </div>
                <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                  <StatusBadge status={editingBook.status} />
                  <MetaChip>{languageLabel(editingBook.direction)}</MetaChip>
                  <MetaChip>{directionLabel(editingBook.direction)}</MetaChip>
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Created {new Date(editingBook.createdAt).toLocaleDateString()}
                  <br />
                  Updated {new Date(editingBook.updatedAt).toLocaleDateString()}
                </div>
              </div>

              <div style={{ display: "grid", gap: "0.9rem" }}>
                <form action={updateStorybookAction} style={{ display: "grid", gap: "0.65rem" }}>
                  <input type="hidden" name="id" value={editingBook.id} />
                  <input type="hidden" name="returnLang" value={activeLang} />
                  <label style={{ display: "grid", gap: "0.25rem", fontSize: 13, color: "#374151" }}>
                    Title
                    <input name="title" defaultValue={editingBook.title} placeholder="Title" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db" }} />
                  </label>
                  <label style={{ display: "grid", gap: "0.25rem", fontSize: 13, color: "#374151" }}>
                    Slug
                    <input name="slug" defaultValue={editingBook.slug} placeholder="Slug" style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db" }} />
                  </label>
                  <label style={{ display: "grid", gap: "0.25rem", fontSize: 13, color: "#374151" }}>
                    Summary
                    <textarea name="summary" defaultValue={editingBook.summary || ""} placeholder="Summary" rows={3} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db" }} />
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "0.65rem" }}>
                    <label style={{ display: "grid", gap: "0.25rem", fontSize: 13, color: "#374151" }}>
                      Status
                      <select name="status" defaultValue={editingBook.status} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db" }}>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "0.25rem", fontSize: 13, color: "#374151" }}>
                      Book language / direction
                      <select name="direction" defaultValue={editingBook.direction} style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db" }}>
                        <option value="ltr">English — Left to Right</option>
                        <option value="rtl">Hebrew — Right to Left</option>
                      </select>
                    </label>
                  </div>
                  <label style={{ display: "grid", gap: "0.25rem", fontSize: 13, color: "#374151" }}>
                    Library thumbnail asset ID
                    <input
                      name="coverAssetId"
                      defaultValue={editingBook.coverAssetId || ""}
                      placeholder="Library thumbnail asset ID"
                      style={{ padding: "0.6rem", borderRadius: 8, border: "1px solid #d1d5db" }}
                    />
                  </label>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "0.75rem", background: "#f8fafc" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: "0.45rem" }}>Upload or replace library thumbnail</div>
                    <CoverUploadForm storybookId={editingBook.id} currentAssetId={editingBook.coverAssetId || ""} />
                    {isPlaceholderCoverAsset(editingBook.coverAssetId) ? (
                      <p style={{ margin: "0.55rem 0 0", color: "#92400e", fontSize: 12 }}>
                        This book is still using a placeholder cover. Upload a real thumbnail when ready.
                      </p>
                    ) : null}
                  </div>
                  <button type="submit" style={{ padding: "0.75rem", borderRadius: 9, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}>
                    Save Metadata
                  </button>
                </form>

                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.85rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Link href={`/studio/${editingBook.id}`} style={{ padding: "0.55rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", textDecoration: "none", color: "inherit", background: "#fff", fontWeight: 600 }}>
                    Open Editor
                  </Link>
                  <form action={duplicateStorybookAction}>
                    <input type="hidden" name="id" value={editingBook.id} />
                    <input type="hidden" name="returnLang" value={activeLang} />
                    <button type="submit" style={{ padding: "0.55rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                      Duplicate
                    </button>
                  </form>
                  <DeleteStorybookForm id={editingBook.id} action={deleteStorybookAction} />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
