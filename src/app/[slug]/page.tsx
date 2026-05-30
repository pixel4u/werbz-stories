import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { BookViewer } from "@/components/book/book-viewer";
import { isStudioAuthenticated } from "@/lib/studio-auth";
import {
  clearViewerPendingCookie,
  readViewerPendingCookie,
  readViewerSessionCookie,
  setViewerPendingCookie,
  setViewerSessionCookie,
} from "@/lib/viewer-auth";
import { getPublishedStorybookBySlug } from "@/lib/stories/repository";
import { findVerifiedViewer, logViewEvent, requestViewerOtp, verifyViewerOtp } from "@/lib/viewer-service";

interface StoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; step?: string; sent?: string }>;
}

async function requestOtpAction(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "");

  try {
    const result = await requestViewerOtp(email);
    await setViewerPendingCookie(result.email);
    redirect(`/${slug}?step=code&sent=1`);
  } catch {
    redirect(`/${slug}?error=email`);
  }
}

async function verifyOtpAction(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug") ?? "");
  const code = String(formData.get("code") ?? "");

  const pendingEmail = await readViewerPendingCookie();
  if (!pendingEmail) {
    redirect(`/${slug}?error=expired`);
  }

  try {
    const verified = await verifyViewerOtp(pendingEmail, code);
    await setViewerSessionCookie(verified.viewerId, verified.email);
    await clearViewerPendingCookie();
    revalidatePath(`/${slug}`);
    redirect(`/${slug}`);
  } catch {
    redirect(`/${slug}?step=code&error=code`);
  }
}

function GateView({ slug, step, error }: { slug: string; step: string; error?: string }) {
  return (
    <main style={{ maxWidth: 520, margin: "3rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: "0.8rem" }}>Read This Story</h1>
      <p style={{ color: "#4b5563" }}>Enter your email to continue.</p>

      {step === "code" ? (
        <form action={verifyOtpAction} style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
          <input type="hidden" name="slug" value={slug} />
          <label htmlFor="code">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" maxLength={6} required style={{ padding: "0.6rem" }} />
          <button type="submit" style={{ padding: "0.7rem", cursor: "pointer" }}>
            Verify code
          </button>
        </form>
      ) : (
        <form action={requestOtpAction} style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
          <input type="hidden" name="slug" value={slug} />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required style={{ padding: "0.6rem" }} />
          <button type="submit" style={{ padding: "0.7rem", cursor: "pointer" }}>
            Send code
          </button>
        </form>
      )}

      <p style={{ marginTop: "1rem", color: "#6b7280", fontSize: 13 }}>
        We’ll email you about new stories. You can unsubscribe anytime.
      </p>
      <p style={{ marginTop: "0.35rem", fontSize: 13 }}>
        <Link href="/unsubscribe">Unsubscribe</Link>
      </p>

      {error === "email" ? <p style={{ color: "#b91c1c" }}>Could not send code. Check email or provider config.</p> : null}
      {error === "code" ? <p style={{ color: "#b91c1c" }}>Invalid or expired code.</p> : null}
      {error === "expired" ? <p style={{ color: "#b91c1c" }}>Session expired. Request a new code.</p> : null}
    </main>
  );
}

export default async function StoryPage({ params, searchParams }: StoryPageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const storybook = await getPublishedStorybookBySlug(slug);
  if (!storybook) {
    redirect("/");
  }

  const isStudioOwner = await isStudioAuthenticated();
  if (isStudioOwner) {
    return <BookViewer slug={slug} />;
  }

  const session = await readViewerSessionCookie();
  if (!session) {
    return <GateView slug={slug} step={query.step === "code" ? "code" : "email"} error={query.error} />;
  }

  const verified = await findVerifiedViewer(session.viewerId, session.email);
  if (!verified) {
    return <GateView slug={slug} step={query.step === "code" ? "code" : "email"} error={query.error} />;
  }

  await logViewEvent(session.viewerId, storybook.id);
  return <BookViewer slug={slug} />;
}
