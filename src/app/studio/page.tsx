import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  clearStudioSessionCookie,
  isStudioAuthenticated,
  requireStudioPassword,
  setStudioSessionCookie,
} from "@/lib/studio-auth";
import {
  createStorybook,
  deleteStorybook,
  duplicateStorybook,
  listStudioStorybooks,
  setStorybookStatus,
  updateStorybookMeta,
} from "@/lib/studio-service";
import { DeleteStorybookForm } from "@/components/studio/delete-storybook-form";

async function loginAction(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const ok = await requireStudioPassword(password);
  if (!ok) {
    redirect("/studio?error=invalid-password");
  }
  await setStudioSessionCookie();
  redirect("/studio");
}

async function logoutAction() {
  "use server";
  await clearStudioSessionCookie();
  redirect("/studio");
}

async function createStorybookAction() {
  "use server";
  await createStorybook();
  revalidatePath("/studio");
  redirect("/studio");
}

async function updateStorybookAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const summary = String(formData.get("summary") ?? "");
  const status = (String(formData.get("status") ?? "draft") === "published" ? "published" : "draft") as
    | "draft"
    | "published";
  const coverAssetId = String(formData.get("coverAssetId") ?? "");

  await updateStorybookMeta({ id, title, slug, summary, status, coverAssetId });
  revalidatePath("/studio");
  redirect("/studio");
}

async function togglePublishAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const nextStatus = (String(formData.get("nextStatus") ?? "draft") === "published"
    ? "published"
    : "draft") as "draft" | "published";
  await setStorybookStatus(id, nextStatus);
  revalidatePath("/studio");
  redirect("/studio");
}

async function duplicateStorybookAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  await duplicateStorybook(id);
  revalidatePath("/studio");
  redirect("/studio");
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
    <span style={{ background: bg, color: fg, borderRadius: 12, padding: "0.2rem 0.6rem", fontSize: 12 }}>
      {status}
    </span>
  );
}

function LoginView({ error }: { error?: string }) {
  return (
    <main style={{ maxWidth: 420, margin: "3rem auto", padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "1rem" }}>Studio Login</h1>
      <form action={loginAction} style={{ display: "grid", gap: "0.8rem" }}>
        <label htmlFor="password">Owner Password</label>
        <input id="password" name="password" type="password" required style={{ padding: "0.6rem" }} />
        <button type="submit" style={{ padding: "0.7rem", cursor: "pointer" }}>
          Login
        </button>
      </form>
      {error === "invalid-password" ? (
        <p style={{ color: "#b91c1c", marginTop: "0.8rem" }}>Incorrect password.</p>
      ) : null}
    </main>
  );
}

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const authenticated = await isStudioAuthenticated();
  const params = await searchParams;

  if (!authenticated) {
    return <LoginView error={params.error} />;
  }

  const books = await listStudioStorybooks();

  return (
    <main style={{ maxWidth: 1200, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h1>Studio</h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <form action={createStorybookAction}>
            <button type="submit" style={{ padding: "0.6rem 1rem", cursor: "pointer" }}>
              New Storybook
            </button>
          </form>
          <form action={logoutAction}>
            <button type="submit" style={{ padding: "0.6rem 1rem", cursor: "pointer" }}>
              Logout
            </button>
          </form>
        </div>
      </div>

      <div style={{ display: "grid", gap: "1rem" }}>
        {books.map((book) => {
          const nextStatus = book.status === "published" ? "draft" : "published";
          return (
            <article key={book.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                <strong>{book.title}</strong>
                <StatusBadge status={book.status} />
              </div>
              <p style={{ marginBottom: "0.8rem", color: "#555" }}>{book.summary || "No summary"}</p>
              <p style={{ fontSize: 13, marginBottom: "0.8rem", color: "#666" }}>
                slug: <code>{book.slug}</code> | coverAssetId: <code>{book.coverAssetId || "none"}</code> | pages: {book.pageCount} | views: {book.viewCount} | updated: {new Date(book.updatedAt).toLocaleString()}
              </p>

              <form action={updateStorybookAction} style={{ display: "grid", gap: "0.5rem", marginBottom: "0.7rem" }}>
                <input type="hidden" name="id" value={book.id} />
                <input name="title" defaultValue={book.title} placeholder="Title" style={{ padding: "0.5rem" }} />
                <input name="slug" defaultValue={book.slug} placeholder="Slug" style={{ padding: "0.5rem" }} />
                <textarea name="summary" defaultValue={book.summary || ""} placeholder="Summary" rows={2} style={{ padding: "0.5rem" }} />
                <input
                  name="coverAssetId"
                  defaultValue={book.coverAssetId || ""}
                  placeholder="Cover asset ID"
                  style={{ padding: "0.5rem" }}
                />
                <select name="status" defaultValue={book.status} style={{ padding: "0.5rem" }}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
                <button type="submit" style={{ padding: "0.6rem", cursor: "pointer" }}>
                  Save Metadata
                </button>
              </form>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <Link
                  href={`/studio/${book.id}`}
                  style={{
                    padding: "0.5rem 0.8rem",
                    cursor: "pointer",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  Edit Pages
                </Link>

                <form action={togglePublishAction}>
                  <input type="hidden" name="id" value={book.id} />
                  <input type="hidden" name="nextStatus" value={nextStatus} />
                  <button type="submit" style={{ padding: "0.5rem 0.8rem", cursor: "pointer" }}>
                    {book.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                </form>

                <form action={duplicateStorybookAction}>
                  <input type="hidden" name="id" value={book.id} />
                  <button type="submit" style={{ padding: "0.5rem 0.8rem", cursor: "pointer" }}>
                    Duplicate
                  </button>
                </form>

                <DeleteStorybookForm id={book.id} action={deleteStorybookAction} />
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
