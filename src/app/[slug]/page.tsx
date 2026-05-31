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
  const email = String(formData.get("email") ?? "").trim();
  const pendingEmail = await readViewerPendingCookie();
  const targetEmail = email || pendingEmail || "";

  try {
    const result = await requestViewerOtp(targetEmail);
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
    <main style={{ maxWidth: 560, margin: "3rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "1.2rem", boxShadow: "0 2px 10px rgba(15,23,42,0.04)" }}>
        <h1 style={{ margin: "0 0 0.6rem" }}>Read This Story</h1>
        <p style={{ color: "#4b5563", marginTop: 0 }}>Enter your email to receive a one-time reading code.</p>

        {step === "code" ? (
          <>
            <form action={verifyOtpAction} style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
              <input type="hidden" name="slug" value={slug} />
              <label htmlFor="code">6-digit code</label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="123456"
                style={{ padding: "0.7rem", fontSize: 18, letterSpacing: "0.2rem", textAlign: "center" }}
              />
              <button type="submit" style={{ padding: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
                Verify code
              </button>
            </form>
            <form action={requestOtpAction} style={{ marginTop: "0.7rem" }}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="email" value="" />
              <button type="submit" style={{ padding: "0.55rem 0.75rem", cursor: "pointer" }}>
                Resend code
              </button>
            </form>
          </>
        ) : (
          <form action={requestOtpAction} style={{ display: "grid", gap: "0.7rem", marginTop: "1rem" }}>
            <input type="hidden" name="slug" value={slug} />
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required style={{ padding: "0.7rem" }} />
            <button type="submit" style={{ padding: "0.75rem", cursor: "pointer", fontWeight: 600 }}>
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

        {error === "email" ? <p style={{ color: "#b91c1c" }}>Could not send code. Please try again in a moment.</p> : null}
        {error === "code" ? <p style={{ color: "#b91c1c" }}>Invalid or expired code.</p> : null}
        {error === "expired" ? <p style={{ color: "#b91c1c" }}>Session expired. Request a new code.</p> : null}
      </div>
    </main>
  );
}

export default async function StoryPage({ params, searchParams }: StoryPageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const storybook = await getPublishedStorybookBySlug(slug);
  if (!storybook) {
    return (
      <main style={{ maxWidth: 680, margin: "4rem auto", padding: "1rem", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <h1 style={{ marginBottom: "0.6rem" }}>Story not found</h1>
        <p style={{ color: "#4b5563" }}>This story is missing or not published yet.</p>
        <Link href="/" style={{ display: "inline-block", marginTop: "0.8rem" }}>
          Back to Stories
        </Link>
      </main>
    );
  }

  // PUBLIC READER: the OTP email gate is intentionally bypassed so anyone with
  // the link can read the story. The OTP API + GateView + viewer-service remain
  // intact (just not used by this path) so the gate can be re-enabled later by
  // restoring the GateView branch below.
  //
  // Previously gated flow (kept for reference / quick re-enable):
  //   const isStudioOwner = await isStudioAuthenticated();
  //   if (!isStudioOwner) {
  //     const session = await readViewerSessionCookie();
  //     const verified = session && (await findVerifiedViewer(session.viewerId, session.email));
  //     if (!verified) return <GateView slug={slug} step={query.step === "code" ? "code" : "email"} error={query.error} />;
  //   }

  // Still log a view when a verified viewer session happens to exist, so
  // analytics keeps working for known viewers. Anonymous public reads are not
  // logged (view_events.viewer_id is NOT NULL; no schema change here).
  const session = await readViewerSessionCookie();
  if (session) {
    const verified = await findVerifiedViewer(session.viewerId, session.email);
    if (verified) {
      await logViewEvent(session.viewerId, storybook.id);
    }
  }

  return <BookViewer slug={slug} />;
}
