"use client";

import { useMemo, useState } from "react";

import { getAssetUrl } from "@/lib/assets";

interface ImageUploadFormProps {
  storybookId: string;
  pageId: string;
  currentAssetId: string;
  // Which asset slot this upload writes to. Defaults to the image-page asset.
  target?: "page-image" | "text-background";
  // Name of the hidden form input this upload should populate so a single
  // "Save" commits the image together with the page's text. When set, the
  // upload updates that field + preview in place instead of reloading.
  fieldName?: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

export function ImageUploadForm({ storybookId, pageId, currentAssetId, target, fieldName }: ImageUploadFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedAssetId, setUploadedAssetId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const previewAssetId = uploadedAssetId || currentAssetId;
  const previewUrl = useMemo(() => (previewAssetId ? getAssetUrl(previewAssetId) : null), [previewAssetId]);

  async function upload(file: File) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError("File is larger than 10MB.");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      setError("Use jpg, png, webp, or gif.");
      return;
    }

    setBusy(true);
    try {
      const dimensions = await readImageDimensions(file);
      const formData = new FormData();
      formData.set("storybookId", storybookId);
      formData.set("pageId", pageId);
      formData.set("file", file);
      if (target) formData.set("target", target);
      if (dimensions.width) formData.set("width", String(dimensions.width));
      if (dimensions.height) formData.set("height", String(dimensions.height));

      const res = await fetch("/api/studio/assets/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await res.json()) as { ok?: boolean; assetId?: string; error?: string };
      if (!res.ok || !payload.ok || !payload.assetId) {
        throw new Error(payload.error || "Upload failed");
      }

      setUploadedAssetId(payload.assetId);
      // Populate the matching hidden form field so the single Save commits this
      // image with the page's text. Update the preview in place (no reload) so
      // typed-but-unsaved text is never lost.
      if (fieldName) {
        const input = document.querySelector<HTMLInputElement>(`input[name="${fieldName}"]`);
        if (input) input.value = payload.assetId;
      } else {
        // No bound field (legacy callers): fall back to a refresh so the saved
        // image is reflected.
        window.location.reload();
      }
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: "0.75rem" }}>
      <label style={{ display: "block", marginBottom: "0.4rem" }}>Upload image (max 10MB)</label>
      <p style={{ margin: "0 0 0.6rem", color: "#64748b", fontSize: 13 }}>Supported: JPG, PNG, WEBP, GIF.</p>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (event) => {
          event.preventDefault();
          setDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (!file) return;
          await upload(file);
        }}
        style={{
          border: dragOver ? "2px solid #2563eb" : "1px dashed #94a3b8",
          borderRadius: 8,
          padding: "0.8rem",
          marginBottom: "0.6rem",
          background: dragOver ? "#eff6ff" : "#f8fafc",
        }}
      >
        Drag and drop image here
      </div>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          await upload(file);
          event.currentTarget.value = "";
        }}
      />
      {previewUrl ? (
        <div style={{ marginTop: "0.75rem" }}>
          <img
            src={previewUrl}
            alt="Image page preview"
            style={{ width: 180, height: 120, objectFit: "cover", borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
        </div>
      ) : null}
      {uploadedAssetId ? <p style={{ marginTop: "0.5rem", color: "#065f46" }}>Uploaded and linked successfully.</p> : null}
      {error ? <p style={{ color: "#b91c1c", marginTop: "0.5rem" }}>{error}</p> : null}
    </div>
  );
}
