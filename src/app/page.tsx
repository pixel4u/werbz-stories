import Link from "next/link";

import { getAssetUrl } from "@/lib/asset-url";
import { listPublishedStorybooks } from "@/lib/stories/repository";

export const dynamic = "force-dynamic";

// A single story rendered as a standing 3D hardback book: the real cover image
// on the front face, a thick spine on the left, page-block edges on the right,
// a soft top-light sheen, and a grounded drop shadow. Mimics the reader's book
// look instead of a flat card.
function BookCover({
  slug,
  title,
  coverAssetId,
  aspectRatio,
}: {
  slug: string;
  title: string;
  coverAssetId?: string;
  aspectRatio?: number;
}) {
  const coverUrl = getAssetUrl(coverAssetId || "asset-placeholder-cover");
  // Size the book to its real cover shape: fixed width, height from the ratio
  // (width / height). Clamp so extreme shapes still sit nicely on the shelf.
  const STAGE_W = 220;
  const ratio = aspectRatio && aspectRatio > 0 ? Math.min(Math.max(aspectRatio, 0.5), 2) : 220 / 300;
  const stageH = Math.round(STAGE_W / ratio);
  return (
    <Link href={`/${slug}`} className="book-link" aria-label={title}>
      <div className="book-stage" style={{ width: STAGE_W, height: stageH }}>
        <div className="book">
          {/* page block edge (right) */}
          <div className="book-pages" aria-hidden />
          {/* spine (left) */}
          <div className="book-spine" aria-hidden />
          {/* front cover with the real cover art + lighting sheen */}
          <div className="book-cover">
            <img src={coverUrl} alt={title} className="book-cover-img" />
            <div className="book-sheen" aria-hidden />
            <div className="book-hinge" aria-hidden />
          </div>
        </div>
        <div className="book-shadow" aria-hidden />
      </div>
      <div className="book-title">{title}</div>
    </Link>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ lang?: string }>;
}) {
  const items = await listPublishedStorybooks();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeLang = resolvedSearchParams?.lang === "hebrew" || resolvedSearchParams?.lang === "english" ? resolvedSearchParams.lang : null;
  const filteredItems =
    activeLang === "hebrew"
      ? items.filter((item) => item.direction === "rtl")
      : activeLang === "english"
        ? items.filter((item) => item.direction !== "rtl")
        : items;

  return (
    <main className="library">
      <header className="library-head">
        <h1>Stories</h1>
        <p>A little shelf of storybooks from Werbz.</p>
        <div className="language-toggle" role="group" aria-label="Filter stories by language">
          <Link href={activeLang === "english" ? "/" : "/?lang=english"} className={`language-chip${activeLang === "english" ? " active" : ""}`}>
            English
          </Link>
          <Link href={activeLang === "hebrew" ? "/" : "/?lang=hebrew"} className={`language-chip${activeLang === "hebrew" ? " active" : ""}`}>
            Hebrew
          </Link>
        </div>
        <p className="language-note">Hebrew books are detected automatically from right-to-left reading direction.</p>
      </header>

      {items.length === 0 ? (
        <p className="library-empty">No published stories yet.</p>
      ) : filteredItems.length === 0 ? (
        <p className="library-empty">No {activeLang === "hebrew" ? "Hebrew" : "English"} stories yet.</p>
      ) : (
        <div className="shelf">
          {filteredItems.map((item) => (
            <BookCover key={item.id} slug={item.slug} title={item.title} coverAssetId={item.coverAssetId} aspectRatio={item.pageAspectRatio} />
          ))}
        </div>
      )}

      <style>{`
        .library {
          min-height: 100vh;
          margin: 0;
          padding: 3.5rem 1.5rem 5rem;
          font-family: "Georgia", "Times New Roman", serif;
          color: #f4efe6;
          background:
            radial-gradient(1200px 600px at 50% -10%, #3a3531 0%, transparent 60%),
            linear-gradient(180deg, #211d1a 0%, #15110f 100%);
        }
        .library-head { text-align: center; margin-bottom: 3rem; }
        .library-head h1 { margin: 0 0 0.5rem; font-size: 2.4rem; letter-spacing: 0.01em; }
        .library-head p { margin: 0; color: #b6aaa0; font-family: system-ui, sans-serif; font-size: 0.95rem; }
        .language-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          margin-top: 1.35rem;
          padding: 0.45rem;
          border-radius: 999px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 18px 38px rgba(0,0,0,.18);
        }
        .language-chip {
          min-width: 124px;
          padding: 0.85rem 1.25rem;
          border-radius: 999px;
          text-decoration: none;
          color: #eaddca;
          font-family: system-ui, sans-serif;
          font-size: 0.92rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          background: transparent;
          transition: background .22s ease, color .22s ease, transform .22s ease, box-shadow .22s ease;
        }
        .language-chip:hover {
          background: rgba(255,255,255,0.09);
          transform: translateY(-1px);
        }
        .language-chip.active {
          color: #1d1713;
          background: linear-gradient(180deg, #f2dfb2 0%, #d7b978 100%);
          box-shadow: 0 10px 24px rgba(0,0,0,.22);
        }
        .language-note {
          margin-top: 0.85rem !important;
          color: #9f948a !important;
          font-size: 0.86rem !important;
        }
        .library-empty { text-align: center; color: #b6aaa0; font-family: system-ui, sans-serif; }

        .shelf {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 3rem 2.5rem;
          justify-items: center;
          align-items: end;
        }

        .book-link { text-decoration: none; color: inherit; display: block; }
        .book-stage {
          position: relative;
          /* width/height are set inline per book from its real aspect ratio */
          perspective: 1400px;
          margin: 0 auto;
        }
        .book {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
          transform: rotateY(-22deg) rotateX(4deg);
          transition: transform 0.5s cubic-bezier(.2,.7,.2,1);
        }
        .book-link:hover .book { transform: rotateY(-8deg) rotateX(2deg) translateY(-6px); }

        /* Front cover */
        .book-cover {
          position: absolute;
          inset: 0;
          border-radius: 4px 8px 8px 4px;
          overflow: hidden;
          background: #2a2622;
          box-shadow: 0 10px 30px rgba(0,0,0,.45);
        }
        .book-cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }

        /* Soft top-down light sheen, like the reader cover sheen */
        .book-sheen {
          position: absolute; inset: 0;
          background:
            linear-gradient(105deg, rgba(255,255,255,.28) 0%, rgba(255,255,255,.06) 18%, rgba(255,255,255,0) 42%),
            linear-gradient(180deg, rgba(255,255,255,.10) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.28) 100%);
          pointer-events: none;
        }
        /* Inner hinge shadow near the spine */
        .book-hinge {
          position: absolute; top: 0; left: 0; bottom: 0; width: 18px;
          background: linear-gradient(90deg, rgba(0,0,0,.40), rgba(0,0,0,0));
          pointer-events: none;
        }

        /* Spine on the left, pushed back in 3D */
        .book-spine {
          position: absolute; top: 0; bottom: 0; left: 0; width: 26px;
          transform: translateX(-13px) rotateY(78deg);
          transform-origin: left center;
          background: linear-gradient(90deg, #1c1916, #2e2924 60%, #1c1916);
          border-radius: 3px 0 0 3px;
          box-shadow: inset 0 0 8px rgba(0,0,0,.5);
        }
        /* Page block on the right edge */
        .book-pages {
          position: absolute; top: 6px; bottom: 6px; right: 0; width: 22px;
          transform: translateX(11px) rotateY(-82deg);
          transform-origin: right center;
          background: repeating-linear-gradient(90deg, #efe9dc 0px, #efe9dc 1px, #d7cfbd 2px, #efe9dc 3px);
          border-radius: 0 2px 2px 0;
        }

        /* Grounded contact shadow */
        .book-shadow {
          position: absolute;
          left: 50%; bottom: -22px;
          width: 78%; height: 26px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at center, rgba(0,0,0,.55), rgba(0,0,0,0) 70%);
          filter: blur(3px);
        }

        .book-title {
          margin-top: 1.5rem;
          text-align: center;
          font-size: 1.05rem;
          color: #efe7d8;
        }

        @media (max-width: 640px) {
          .language-toggle {
            gap: 0.5rem;
            padding: 0.35rem;
          }
          .language-chip {
            min-width: 0;
            padding: 0.8rem 1rem;
            font-size: 0.88rem;
          }
        }
      `}</style>
    </main>
  );
}
