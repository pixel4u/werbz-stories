"use client";

import { useMemo } from "react";

interface BookViewerProps {
  slug: string;
}

export function BookViewer({ slug }: BookViewerProps) {
  const src = useMemo(() => `/api/book/${encodeURIComponent(slug)}`, [slug]);

  return (
    <iframe
      title={`Storybook ${slug}`}
      src={src}
      style={{ width: "100%", height: "100vh", border: 0, display: "block" }}
      allow="fullscreen"
    />
  );
}
