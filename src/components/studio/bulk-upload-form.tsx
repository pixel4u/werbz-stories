"use client";

import { useState } from "react";

interface BulkUploadFormProps {
  storybookId: string;
}

function readImageDimensions(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({});
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function BulkUploadForm({ storybookId }: BulkUploadFormProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [useFirstAsCover, setUseFirstAsCover] = useState(true);

  async function onSelect(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const files = Array.from(filesList);
      const formData = new FormData();
      formData.set("useFirstAsCover", String(useFirstAsCover));
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        formData.append("files", f, f.name);
        const dims = await readImageDimensions(f);
        if (dims.width) formData.set(`w_${i}`, String(dims.width));
        if (dims.height) formData.set(`h_${i}`, String(dims.height));
      }

      const res = await fetch(`/api/studio/storybooks/${encodeURIComponent(storybookId)}/bulk-upload`, {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json()) as { ok?: boolean; createdPages?: number; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error || "Bulk upload failed");
      setMessage(`Uploaded ${files.length} images. Created ${payload.createdPages || 0} pages.`);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid #dbe3ef", borderRadius: 10, padding: "0.65rem", background: "#fff" }}>
      <strong style={{ fontSize: 13 }}>Upload all your book page images in order</strong>
      <p style={{ margin: "0.35rem 0 0.5rem", fontSize: 12, color: "#64748b" }}>
        First image becomes the Cover, the last becomes the End, and everything in
        between becomes story pages.
      </p>
      <label style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
        <input type="checkbox" checked={useFirstAsCover} onChange={(e) => setUseFirstAsCover(e.target.checked)} /> Also use the first image as the library thumbnail
      </label>
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={busy}
        onChange={(e) => {
          onSelect(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      {busy ? <p style={{ margin: "0.5rem 0 0", fontSize: 12 }}>Uploading...</p> : null}
      {message ? <p style={{ margin: "0.5rem 0 0", fontSize: 12, color: "#065f46" }}>{message}</p> : null}
      {error ? <p style={{ margin: "0.5rem 0 0", fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
    </div>
  );
}

