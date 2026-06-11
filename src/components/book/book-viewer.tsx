"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

interface BookViewerProps {
  slug: string;
  title?: string;
}

export function BookViewer({ slug, title }: BookViewerProps) {
  const searchParams = useSearchParams();
  const [loaded, setLoaded] = useState(false);

  const src = useMemo(() => {
    const base = `/api/book/${encodeURIComponent(slug)}`;
    const debug = searchParams.get("debug");
    if (debug === "1") return `${base}?engine=best&debug=1`;
    return `${base}?engine=best`;
  }, [slug, searchParams]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", background: "#f7f7f5" }}>
      {!loaded ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background:
              "radial-gradient(120% 90% at 50% 30%, rgba(255,224,176,.26), transparent 44%), linear-gradient(180deg, #1b2527 0%, #0a0f12 100%)",
            color: "#f4ead9",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ textAlign: "center", padding: "2rem", maxWidth: 360 }}>
            <div
              aria-hidden
              style={{
                width: 94,
                height: 118,
                margin: "0 auto 1.25rem",
                borderRadius: "10px 14px 14px 10px",
                background: "linear-gradient(180deg, #ecd195 0%, #b78f49 100%)",
                boxShadow: "0 24px 46px rgba(0,0,0,.34)",
                position: "relative",
                animation: "bookPulse 1.5s ease-in-out infinite",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  top: 0,
                  bottom: 0,
                  width: 14,
                  background: "linear-gradient(180deg, rgba(0,0,0,.28), rgba(255,255,255,.12), rgba(0,0,0,.28))",
                }}
              />
            </div>
            <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(244,234,217,.72)" }}>
              Opening Story
            </div>
            <div style={{ marginTop: 10, fontSize: 28, lineHeight: 1.15, fontFamily: 'Georgia, "Times New Roman", serif' }}>
              {title || slug}
            </div>
            <div style={{ marginTop: 12, fontSize: 15, color: "rgba(244,234,217,.76)" }}>Preparing pages, images, and the reading view.</div>
            <style>{`@keyframes bookPulse { 0%,100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-4px) scale(1.02); } }`}</style>
          </div>
        </div>
      ) : null}
      <iframe
        title={`Storybook ${slug}`}
        src={src}
        onLoad={() => setLoaded(true)}
        style={{ width: "100%", height: "100vh", border: 0, display: "block", opacity: loaded ? 1 : 0 }}
        allow="fullscreen"
      />
    </div>
  );
}
