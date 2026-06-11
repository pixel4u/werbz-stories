import Link from "next/link";

import { BookViewer } from "@/components/book/book-viewer";
import { readViewerSessionCookie } from "@/lib/viewer-auth";
import { getPublishedStorybookBySlug } from "@/lib/stories/repository";
import { findVerifiedViewer, logViewEvent } from "@/lib/viewer-service";

interface StoryPageProps {
  params: Promise<{ slug: string }>;
}
export default async function StoryPage({ params }: StoryPageProps) {
  const { slug } = await params;

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

  return <BookViewer slug={slug} title={storybook.title} />;
}
