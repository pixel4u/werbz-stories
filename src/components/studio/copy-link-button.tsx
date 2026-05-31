"use client";

import { useState } from "react";

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}
    >
      {copied ? "Copied" : "Copy Link"}
    </button>
  );
}

