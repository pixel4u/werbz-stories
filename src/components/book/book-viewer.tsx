"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

interface BookViewerProps {
  slug: string;
}

export function BookViewer({ slug }: BookViewerProps) {
  const searchParams = useSearchParams();

  const src = useMemo(() => {
    const base = `/api/book/${encodeURIComponent(slug)}`;
    const debug = searchParams.get("debug");
    if (debug === "1") return `${base}?debug=1`;
    return base;
  }, [slug, searchParams]);

  return (
    <iframe
      title={`Storybook ${slug}`}
      src={src}
      style={{ width: "100%", height: "100vh", border: 0, display: "block" }}
      allow="fullscreen"
    />
  );
}
