"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

interface BookViewerProps {
  slug: string;
}

export function BookViewer({ slug }: BookViewerProps) {
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
            color: "#4b5563",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          Loading story...
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
