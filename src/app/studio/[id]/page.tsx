import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isStudioAuthenticated } from "@/lib/studio-auth";
import {
  addPage,
  deletePage,
  getStudioStorybookById,
  movePageDown,
  movePageUp,
  type StudioPageRow,
  updatePage,
} from "@/lib/studio-service";
import type { PageContent } from "@/lib/stories/schema";
import { DeletePageForm } from "@/components/studio/delete-page-form";
import { ImageUploadForm } from "@/components/studio/image-upload-form";
import { getAssetUrl } from "@/lib/assets";

interface Props {
  params: Promise<{ id: string }>;
}

function parseBoolean(value: FormDataEntryValue | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on";
}

function contentPreview(content: PageContent): string {
  if (content.kind === "text") {
    return `${content.title || "Untitled"} ${content.body ? `- ${content.body.slice(0, 80)}` : ""}`.trim();
  }
  if (content.kind === "image") {
    return `assetId=${content.assetId} fit=${content.fit}`;
  }
  if (content.kind === "video") {
    return `assetId=${content.assetId} poster=${content.poster || "none"}`;
  }
  const source = content.source.type === "asset" ? `asset:${content.source.assetId}` : `url:${content.source.url}`;
  return `${source} poster=${content.poster}`;
}

function PageEditFields({ storybookId, page }: { storybookId: string; page: StudioPageRow }) {
  if (page.content.kind === "text") {
    return (
      <>
        <input name="eyebrow" defaultValue={page.content.eyebrow || ""} placeholder="Eyebrow" style={{ padding: "0.5rem" }} />
        <input name="title" defaultValue={page.content.title || ""} placeholder="Title" style={{ padding: "0.5rem" }} />
        <textarea name="body" defaultValue={page.content.body || ""} placeholder="Body" rows={4} style={{ padding: "0.5rem" }} />
        <select name="align" defaultValue={page.content.align || "left"} style={{ padding: "0.5rem" }}>
          <option value="left">left</option>
          <option value="center">center</option>
          <option value="right">right</option>
        </select>
        <input
          name="background"
          defaultValue={page.content.background || ""}
          placeholder="Background hex (optional, e.g. #1E3A8A)"
          style={{ padding: "0.5rem" }}
        />
      </>
    );
  }

  if (page.content.kind === "image") {
    return (
      <>
        <input name="assetId" defaultValue={page.content.assetId} placeholder="assetId" style={{ padding: "0.5rem" }} />
        <select name="fit" defaultValue={page.content.fit || "cover"} style={{ padding: "0.5rem" }}>
          <option value="cover">cover</option>
          <option value="contain">contain</option>
        </select>
        <input name="caption" defaultValue={page.content.caption || ""} placeholder="Caption (optional)" style={{ padding: "0.5rem" }} />
        <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
          Current image asset: <code>{page.content.assetId || "none"}</code>
        </p>
        {page.content.assetId ? (
          <img
            src={getAssetUrl(page.content.assetId)}
            alt="Current page asset preview"
            style={{ width: 180, height: 120, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
        ) : null}
        <ImageUploadForm storybookId={storybookId} pageId={page.id} currentAssetId={page.content.assetId} />
      </>
    );
  }

  if (page.content.kind === "video") {
    return (
      <>
        <input name="assetId" defaultValue={page.content.assetId} placeholder="assetId" style={{ padding: "0.5rem" }} />
        <input name="poster" defaultValue={page.content.poster || ""} placeholder="poster assetId" style={{ padding: "0.5rem" }} />
        <label>
          autoplay
          <input name="autoplay" type="checkbox" defaultChecked={page.content.autoplay} style={{ marginLeft: "0.4rem" }} />
        </label>
        <label>
          loop
          <input name="loop" type="checkbox" defaultChecked={page.content.loop} style={{ marginLeft: "0.4rem" }} />
        </label>
        <label>
          muted
          <input name="muted" type="checkbox" defaultChecked={page.content.muted} style={{ marginLeft: "0.4rem" }} />
        </label>
        <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>Video uploads coming soon. Use assetId/poster fields for now.</p>
      </>
    );
  }

  return (
    <>
      <select name="sourceType" defaultValue={page.content.source.type} style={{ padding: "0.5rem" }}>
        <option value="asset">asset</option>
        <option value="url">url</option>
      </select>
      <input
        name="sourceAssetId"
        defaultValue={page.content.source.type === "asset" ? page.content.source.assetId : ""}
        placeholder="source assetId"
        style={{ padding: "0.5rem" }}
      />
      <input
        name="sourceUrl"
        defaultValue={page.content.source.type === "url" ? page.content.source.url : ""}
        placeholder="source URL"
        style={{ padding: "0.5rem" }}
      />
      <input name="poster" defaultValue={page.content.poster} placeholder="poster assetId" style={{ padding: "0.5rem" }} />
      <label>
        interactive
        <input name="interactive" type="checkbox" defaultChecked={page.content.interactive} style={{ marginLeft: "0.4rem" }} />
      </label>
      <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>Embed bundle uploads coming soon. Use source/poster fields for now.</p>
    </>
  );
}

export default async function StudioStorybookPage({ params }: Props) {
  const authenticated = await isStudioAuthenticated();
  if (!authenticated) redirect("/studio");

  const { id } = await params;

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
        source:
          sourceType === "url"
            ? { type: "url", url: String(formData.get("sourceUrl") ?? "").trim() }
            : { type: "asset", assetId: String(formData.get("sourceAssetId") ?? "").trim() },
        poster: String(formData.get("poster") ?? "").trim(),
        interactive: parseBoolean(formData.get("interactive"), true),
      };
    }

    await updatePage({ pageId, side, content });
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}`);
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

  async function moveUpAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await movePageUp(pageId);
    revalidatePath(`/studio/${storybookId}`);
    revalidatePath("/studio");
    revalidatePath(`/api/storybooks`);
    redirect(`/studio/${storybookId}`);
  }

  async function moveDownAction(formData: FormData) {
    "use server";
    const storybookId = String(formData.get("storybookId") ?? "");
    const pageId = String(formData.get("pageId") ?? "");
    await movePageDown(pageId);
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

  return (
    <main style={{ maxWidth: 1100, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: "0.4rem" }}>{storybook.title}</h1>
          <p style={{ margin: 0, color: "#444" }}>
            slug: <code>{storybook.slug}</code> | status: <strong>{storybook.status}</strong> | pages: {storybook.pageCount}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <Link href="/studio" style={{ padding: "0.55rem 0.8rem", border: "1px solid #d1d5db", borderRadius: 8 }}>
            Back to Studio
          </Link>
          <Link
            href={`/${storybook.slug}`}
            target="_blank"
            style={{ padding: "0.55rem 0.8rem", border: "1px solid #d1d5db", borderRadius: 8 }}
          >
            Preview in Book
          </Link>
        </div>
      </div>

      {storybook.status === "draft" ? (
        <p style={{ marginTop: "0.8rem", color: "#92400e", background: "#fef3c7", padding: "0.7rem", borderRadius: 8 }}>
          Publish this Storybook to preview publicly.
        </p>
      ) : null}

      <section style={{ marginTop: "1.2rem", border: "1px solid #e5e7eb", borderRadius: 10, padding: "0.9rem" }}>
        <h2 style={{ marginTop: 0 }}>Add Page</h2>
        <form action={addPageAction} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <input type="hidden" name="storybookId" value={storybook.id} />
          <select name="kind" defaultValue="text" style={{ padding: "0.5rem" }}>
            <option value="text">text</option>
            <option value="image">image</option>
            <option value="video">video</option>
            <option value="embed">embed</option>
          </select>
          <select name="side" defaultValue="right" style={{ padding: "0.5rem" }}>
            <option value="left">left</option>
            <option value="right">right</option>
          </select>
          <button type="submit" style={{ padding: "0.5rem 0.8rem", cursor: "pointer" }}>
            Add page
          </button>
        </form>
      </section>

      <section style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        {storybook.pages.map((page) => (
          <article key={page.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: "0.9rem" }}>
            <div style={{ marginBottom: "0.6rem" }}>
              <strong>Page {page.position + 1}</strong>
              <p style={{ margin: "0.25rem 0", color: "#555" }}>
                id: <code>{page.id}</code> | position: {page.position} | side: <code>{page.side}</code> | kind: <code>{page.content.kind}</code>
              </p>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>Preview: {contentPreview(page.content)}</p>
            </div>

            <form action={updatePageAction} style={{ display: "grid", gap: "0.5rem", marginBottom: "0.8rem" }}>
              <input type="hidden" name="storybookId" value={storybook.id} />
              <input type="hidden" name="pageId" value={page.id} />
              <input type="hidden" name="kind" value={page.content.kind} />
              <label>
                Side
                <select name="side" defaultValue={page.side} style={{ display: "block", padding: "0.5rem", marginTop: "0.2rem" }}>
                  <option value="left">left</option>
                  <option value="right">right</option>
                </select>
              </label>
              <PageEditFields storybookId={storybook.id} page={page} />
              <button type="submit" style={{ padding: "0.6rem", cursor: "pointer" }}>
                Save Page
              </button>
            </form>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <form action={moveUpAction}>
                <input type="hidden" name="storybookId" value={storybook.id} />
                <input type="hidden" name="pageId" value={page.id} />
                <button type="submit" style={{ padding: "0.5rem 0.8rem", cursor: "pointer" }}>
                  Move Up
                </button>
              </form>

              <form action={moveDownAction}>
                <input type="hidden" name="storybookId" value={storybook.id} />
                <input type="hidden" name="pageId" value={page.id} />
                <button type="submit" style={{ padding: "0.5rem 0.8rem", cursor: "pointer" }}>
                  Move Down
                </button>
              </form>

              <DeletePageForm storybookId={storybook.id} pageId={page.id} action={deletePageAction} />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
