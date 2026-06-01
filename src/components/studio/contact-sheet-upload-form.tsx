"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getAssetUrl } from "@/lib/asset-url";
import { CropOverlayEditor, type DetectedCard } from "@/components/studio/crop-overlay-editor";

interface ContactSheetUploadFormProps {
  storybookId: string;
}

interface UploadResult {
  sheetAssetId: string;
  sheetUrl: string;
  imageWidth: number | null;
  imageHeight: number | null;
}

type ImportMode = "new" | "replace" | "append";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function ContactSheetUploadForm({ storybookId }: ContactSheetUploadFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [cards, setCards] = useState<DetectedCard[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("new");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [expectedCount, setExpectedCount] = useState<number>(5);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [allowMismatchImport, setAllowMismatchImport] = useState(false);
  const lastCardsSignatureRef = useRef<string>("");

  async function upload(file: File) {
    setError("");
    if (!file) return;

    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      setError("Image exceeds 10MB limit.");
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Use jpg, png, webp, or gif.");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const res = await fetch(`/api/studio/storybooks/${encodeURIComponent(storybookId)}/contact-sheet/upload`, {
        method: "POST",
        body: formData,
      });

      const payload = (await res.json()) as Partial<UploadResult> & { error?: string };
      if (!res.ok || !payload.sheetAssetId) {
        throw new Error(payload.error || "Upload failed");
      }

      setResult({
        sheetAssetId: payload.sheetAssetId,
        sheetUrl: payload.sheetUrl || getAssetUrl(payload.sheetAssetId),
        imageWidth: typeof payload.imageWidth === "number" ? payload.imageWidth : null,
        imageHeight: typeof payload.imageHeight === "number" ? payload.imageHeight : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const ordered = [...cards].sort((a, b) => a.positionIndex - b.positionIndex);
  const coverCount = ordered.filter((c) => c.label === "cover").length;
  const endCount = ordered.filter((c) => c.label === "end").length;
  const pageCount = ordered.filter((c) => c.label === "page").length;
  const selectedCount = coverCount + pageCount + endCount;
  const hasAutoDetectFailure = !!result && cards.length === 0;
  const countMismatch = expectedCount > 0 && selectedCount !== expectedCount;
  const importSummary = `Cover + ${pageCount} story page${pageCount === 1 ? "" : "s"} + End`;
  const importDisabled =
    importBusy ||
    ordered.length === 0 ||
    !reviewConfirmed ||
    coverCount !== 1 ||
    endCount !== 1 ||
    (countMismatch && !allowMismatchImport);

  const cardsSignature = useMemo(
    () =>
      JSON.stringify(
        cards.map((c) => ({
          x: c.box.x,
          y: c.box.y,
          w: c.box.width,
          h: c.box.height,
          label: c.label,
          n: c.pageNumber,
          p: c.positionIndex,
        }))
      ),
    [cards]
  );

  useEffect(() => {
    if (!cards.length) {
      lastCardsSignatureRef.current = "";
      return;
    }
    if (cardsSignature !== lastCardsSignatureRef.current) {
      setReviewConfirmed(false);
      setAllowMismatchImport(false);
      lastCardsSignatureRef.current = cardsSignature;
    }
  }, [cards.length, cardsSignature]);

  async function importBook() {
    if (!result) return;
    setImportBusy(true);
    setImportError("");
    try {
      const finalizedCards = ordered
        .filter((c) => c.label === "cover" || c.label === "page" || c.label === "end")
        .map((c, idx) => ({
          box: c.box,
          order: idx,
          role: c.label as "cover" | "page" | "end",
        }));

      const res = await fetch(`/api/studio/storybooks/${encodeURIComponent(storybookId)}/contact-sheet/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sheetAssetId: result.sheetAssetId,
          cards: finalizedCards,
          mode: importMode,
        }),
      });

      const payload = (await res.json()) as { ok?: boolean; error?: string; storybookId?: string };
      if (!res.ok || !payload.ok || !payload.storybookId) {
        throw new Error(payload.error || "Import failed");
      }

      window.location.assign(`/studio/${encodeURIComponent(payload.storybookId)}?imported=1`);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div style={{ border: "1px solid #dbe3ef", borderRadius: 10, padding: "0.75rem", background: "#fff" }}>
      <strong style={{ fontSize: 13 }}>Import Contact Sheet</strong>
      <p style={{ margin: "0.35rem 0 0.6rem", fontSize: 12, color: "#64748b" }}>
        Upload one large contact-sheet image. We will detect and map cards in Step 2.
      </p>

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
          padding: "0.9rem",
          marginBottom: "0.6rem",
          background: dragOver ? "#eff6ff" : "#f8fafc",
          fontSize: 13,
          color: "#475569",
          textAlign: "center",
        }}
      >
        Drag and drop contact sheet here
      </div>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={busy}
        onChange={async (event) => {
          const input = event.currentTarget;
          const file = event.target.files?.[0];
          if (!file) return;
          await upload(file);
          input.value = "";
        }}
      />

      {busy ? <p style={{ margin: "0.55rem 0 0", fontSize: 12 }}>Uploading...</p> : null}
      {error ? <p style={{ margin: "0.55rem 0 0", fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}

      {result ? (
        <div style={{ marginTop: "0.7rem", borderTop: "1px solid #e5e7eb", paddingTop: "0.65rem" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#065f46", fontWeight: 700 }}>Contact sheet uploaded.</p>
          <p style={{ margin: "0.3rem 0 0", fontSize: 12, color: "#475569" }}>
            Asset: <code>{result.sheetAssetId}</code>
          </p>
          <p style={{ margin: "0.25rem 0 0", fontSize: 12, color: "#475569" }}>
            Size: {result.imageWidth ?? "?"} × {result.imageHeight ?? "?"}
          </p>
          {result.imageWidth && result.imageHeight ? (
            <div style={{ marginTop: "0.7rem" }}>
              <div style={{ display: "grid", gap: "0.45rem", marginBottom: "0.7rem", padding: "0.6rem", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8fafc" }}>
                <label style={{ fontSize: 12, color: "#334155", display: "grid", gap: 4 }}>
                  Expected page count (Cover + story pages + End)
                  <input
                    type="number"
                    min={3}
                    value={expectedCount}
                    onChange={(e) => setExpectedCount(Number.parseInt(e.target.value || "0", 10) || 0)}
                    style={{ width: 180, padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" }}
                  />
                </label>
                {hasAutoDetectFailure ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
                    Auto-detection found 0 pages. Create crop boxes manually or use Grid Fallback before importing.
                  </p>
                ) : null}
                {selectedCount > 0 && countMismatch ? (
                  <p style={{ margin: 0, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
                    Expected {expectedCount} pages, but {selectedCount} crop boxes are selected.
                  </p>
                ) : null}
              </div>

              <CropOverlayEditor
                sheetUrl={result.sheetUrl}
                imageWidth={result.imageWidth}
                imageHeight={result.imageHeight}
                onChange={setCards}
                autoOpenOnMount
                hideInlineWorkspace
                modalFooter={
                  <div style={{ display: "grid", gap: "0.45rem" }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>Detection draft captured: {cards.length} boxes.</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#334155" }}>
                      Import result preview: <strong>{importSummary}</strong>
                    </p>
                    <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: 12, color: "#334155" }}>
                      <input type="checkbox" checked={reviewConfirmed} onChange={(e) => setReviewConfirmed(e.target.checked)} />
                      I reviewed these crop boxes and roles.
                    </label>
                    {countMismatch ? (
                      <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: 12, color: "#92400e" }}>
                        <input type="checkbox" checked={allowMismatchImport} onChange={(e) => setAllowMismatchImport(e.target.checked)} />
                        Allow mismatch import ({selectedCount} selected vs expected {expectedCount}).
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={!reviewConfirmed || coverCount !== 1 || endCount !== 1 || (countMismatch && !allowMismatchImport)}
                      onClick={() => {
                        setShowConfirm(true);
                        setImportError("");
                      }}
                      style={{
                        padding: "0.6rem 0.8rem",
                        borderRadius: 8,
                        border: "1px solid #2563eb",
                        background: !reviewConfirmed || coverCount !== 1 || endCount !== 1 || (countMismatch && !allowMismatchImport) ? "#93c5fd" : "#2563eb",
                        color: "#fff",
                        cursor: !reviewConfirmed || coverCount !== 1 || endCount !== 1 || (countMismatch && !allowMismatchImport) ? "not-allowed" : "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Import Book
                    </button>
                  </div>
                }
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showConfirm && result ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", zIndex: 70, display: "grid", placeItems: "center", padding: "1.2rem" }}>
          <div style={{ width: "min(520px, 100%)", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,.28)", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Confirm Import</h2>
              <button type="button" onClick={() => setShowConfirm(false)} style={{ padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.4rem", fontSize: 13, color: "#334155" }}>
              <div>Total crops: {ordered.length}</div>
              <div>Cover crops: {coverCount}</div>
              <div>Story pages: {pageCount}</div>
              <div>End crops: {endCount}</div>
              <div>Expected count: {expectedCount}</div>
              <div>Result preview: {importSummary}</div>
            </div>

            <label style={{ display: "grid", gap: "0.35rem", marginTop: "0.8rem", fontSize: 13 }}>
              Import mode
              <select value={importMode} onChange={(e) => setImportMode(e.target.value as ImportMode)} style={{ padding: "0.55rem", borderRadius: 8, border: "1px solid #d1d5db" }}>
                <option value="new">New book (recommended)</option>
                <option value="replace">Replace current book (disabled in this step)</option>
                <option value="append">Append to current book (disabled in this step)</option>
              </select>
            </label>

            <p style={{ margin: "0.6rem 0 0", fontSize: 12, color: "#64748b" }}>Import only runs after explicit confirmation. No auto-publish.</p>
            {importError ? <p style={{ margin: "0.55rem 0 0", fontSize: 12, color: "#b91c1c" }}>{importError}</p> : null}

            <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.55rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowConfirm(false)} style={{ padding: "0.55rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={importBook}
                disabled={importDisabled}
                style={{ padding: "0.6rem 0.85rem", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}
              >
                {importBusy ? "Importing..." : "Import Book"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
