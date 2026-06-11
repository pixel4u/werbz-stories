"use client";

import { useMemo, useRef, useState } from "react";

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

interface SheetTab {
  id: string;
  fileName: string;
  result: UploadResult;
  cards: DetectedCard[];
  reviewConfirmed: boolean;
  allowMismatchImport: boolean;
}

type ImportMode = "new" | "replace" | "append";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function nextTabId(): string {
  return `sheet-${Math.random().toString(36).slice(2, 10)}`;
}

function cardsSignature(cards: DetectedCard[]): string {
  return JSON.stringify(
    cards.map((c) => ({
      x: c.box.x,
      y: c.box.y,
      w: c.box.width,
      h: c.box.height,
      label: c.label,
      n: c.pageNumber,
      p: c.positionIndex,
    }))
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function cloneTemplateCards(template: DetectedCard[], imageWidth: number, imageHeight: number): DetectedCard[] {
  return template.map((card, idx) => {
    const width = clamp(card.box.width, 20, Math.max(20, imageWidth));
    const height = clamp(card.box.height, 20, Math.max(20, imageHeight));
    const x = clamp(card.box.x, 0, Math.max(0, imageWidth - width));
    const y = clamp(card.box.y, 0, Math.max(0, imageHeight - height));
    return {
      ...card,
      box: { x, y, width, height },
      positionIndex: idx,
    };
  });
}

export function ContactSheetUploadForm({ storybookId }: ContactSheetUploadFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("new");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [expectedCount, setExpectedCount] = useState<number>(5);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  async function uploadOneFile(file: File, templateCards: DetectedCard[]) {
    const formData = new FormData();
    formData.set("file", file);

    const res = await fetch(`/api/studio/storybooks/${encodeURIComponent(storybookId)}/contact-sheet/upload`, {
      method: "POST",
      body: formData,
    });

    const payload = (await res.json()) as Partial<UploadResult> & { error?: string };
    if (!res.ok || !payload.sheetAssetId) {
      throw new Error(payload.error || `Upload failed for ${file.name}`);
    }

    const result: UploadResult = {
      sheetAssetId: payload.sheetAssetId,
      sheetUrl: payload.sheetUrl || getAssetUrl(payload.sheetAssetId),
      imageWidth: typeof payload.imageWidth === "number" ? payload.imageWidth : null,
      imageHeight: typeof payload.imageHeight === "number" ? payload.imageHeight : null,
    };

    const seededCards =
      result.imageWidth && result.imageHeight && templateCards.length > 0
        ? cloneTemplateCards(templateCards, result.imageWidth, result.imageHeight)
        : [];

    return {
      id: nextTabId(),
      fileName: file.name,
      result,
      cards: seededCards,
      reviewConfirmed: false,
      allowMismatchImport: false,
    } satisfies SheetTab;
  }

  async function uploadFiles(files: FileList | File[]) {
    const allFiles = Array.from(files);
    if (allFiles.length === 0) return;

    setError("");

    const invalid = allFiles.find((file) => file.size <= 0 || file.size > MAX_IMAGE_BYTES || !ALLOWED_TYPES.includes(file.type));
    if (invalid) {
      if (invalid.size <= 0 || invalid.size > MAX_IMAGE_BYTES) setError(`${invalid.name} exceeds 10MB limit.`);
      else setError(`${invalid.name} must be jpg, png, webp, or gif.`);
      return;
    }

    setBusy(true);
    try {
      const createdTabs: SheetTab[] = [];
      let templateCards = activeTab?.cards?.length ? activeTab.cards : tabs[tabs.length - 1]?.cards ?? [];

      for (const file of allFiles) {
        const newTab = await uploadOneFile(file, templateCards);
        createdTabs.push(newTab);
        templateCards = newTab.cards.length > 0 ? newTab.cards : templateCards;
      }

      setTabs((prev) => [...prev, ...createdTabs]);
      setActiveTabId(createdTabs[createdTabs.length - 1]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function updateTabCards(tabId: string, nextCards: DetectedCard[]) {
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== tabId) return tab;
        const changed = cardsSignature(tab.cards) !== cardsSignature(nextCards);
        return {
          ...tab,
          cards: nextCards,
          reviewConfirmed: changed ? false : tab.reviewConfirmed,
          allowMismatchImport: changed ? false : tab.allowMismatchImport,
        };
      })
    );
  }

  function updateTab(tabId: string, patch: Partial<Pick<SheetTab, "reviewConfirmed" | "allowMismatchImport">>) {
    setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }

  const tabStats = useMemo(
    () =>
      tabs.map((tab) => {
        const ordered = [...tab.cards].sort((a, b) => a.positionIndex - b.positionIndex);
        const coverCount = ordered.filter((c) => c.label === "cover").length;
        const endCount = ordered.filter((c) => c.label === "end").length;
        const pageCount = ordered.filter((c) => c.label === "page").length;
        const selectedCount = coverCount + pageCount + endCount;
        return {
          tabId: tab.id,
          ordered,
          coverCount,
          endCount,
          pageCount,
          selectedCount,
        };
      }),
    [tabs]
  );

  const activeStats = activeTab ? tabStats.find((stats) => stats.tabId === activeTab.id) ?? null : null;
  const coverCount = tabStats.reduce((sum, stats) => sum + stats.coverCount, 0);
  const endCount = tabStats.reduce((sum, stats) => sum + stats.endCount, 0);
  const pageCount = tabStats.reduce((sum, stats) => sum + stats.pageCount, 0);
  const selectedCount = tabStats.reduce((sum, stats) => sum + stats.selectedCount, 0);
  const countMismatch = expectedCount > 0 && selectedCount !== expectedCount;
  const importSummary = `Cover + ${pageCount} story page${pageCount === 1 ? "" : "s"} + End`;
  const allReviewed = tabs.length > 0 && tabs.every((tab) => tab.reviewConfirmed);
  const mismatchAccepted = !countMismatch || tabs.every((tab) => tab.allowMismatchImport);
  const importDisabled = importBusy || tabs.length === 0 || selectedCount === 0 || !allReviewed || coverCount !== 1 || endCount !== 1 || !mismatchAccepted;

  async function importBook() {
    if (tabs.length === 0) return;
    setImportBusy(true);
    setImportError("");
    try {
      const sheets = tabs
        .map((tab) => ({
          sheetAssetId: tab.result.sheetAssetId,
          cards: [...tab.cards]
            .sort((a, b) => a.positionIndex - b.positionIndex)
            .filter((c) => c.label === "cover" || c.label === "page" || c.label === "end")
            .map((c, idx) => ({
              box: c.box,
              order: idx,
              role: c.label as "cover" | "page" | "end",
            })),
        }))
        .filter((sheet) => sheet.cards.length > 0);

      const res = await fetch(`/api/studio/storybooks/${encodeURIComponent(storybookId)}/contact-sheet/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sheets,
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
        Upload one or many PNG contact sheets. Each file gets its own tab, and one import will combine all reviewed frames into the book.
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
          if (!event.dataTransfer.files?.length) return;
          await uploadFiles(event.dataTransfer.files);
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
        Drag and drop one or more contact sheets here
      </div>

      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          disabled={busy}
          onChange={async (event) => {
            const input = event.currentTarget;
            const files = event.target.files;
            if (!files?.length) return;
            await uploadFiles(files);
            input.value = "";
          }}
        />
        {tabs.length > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "0.5rem 0.8rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontWeight: 600 }}
          >
            Upload another PNG
          </button>
        ) : null}
      </div>

      {busy ? <p style={{ margin: "0.55rem 0 0", fontSize: 12 }}>Uploading...</p> : null}
      {error ? <p style={{ margin: "0.55rem 0 0", fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}

      {tabs.length > 0 ? (
        <div style={{ marginTop: "0.8rem", display: "grid", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.45rem", overflowX: "auto", paddingBottom: 2 }}>
            {tabs.map((tab, index) => {
              const stats = tabStats.find((entry) => entry.tabId === tab.id);
              const isActive = tab.id === activeTabId;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  style={{
                    flex: "0 0 auto",
                    display: "grid",
                    gap: 3,
                    minWidth: 164,
                    padding: "0.65rem 0.8rem",
                    borderRadius: 10,
                    border: isActive ? "1px solid #2563eb" : "1px solid #d1d5db",
                    background: isActive ? "#eff6ff" : "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 11, color: isActive ? "#1d4ed8" : "#64748b", fontWeight: 700 }}>Tab {index + 1}</span>
                  <span style={{ fontSize: 12, color: "#0f172a", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tab.fileName}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{stats?.selectedCount ?? 0} crops</span>
                </button>
              );
            })}
          </div>

          <div style={{ display: "grid", gap: "0.45rem", padding: "0.7rem", border: "1px solid #e5e7eb", borderRadius: 8, background: "#f8fafc" }}>
            <label style={{ fontSize: 12, color: "#334155", display: "grid", gap: 4 }}>
              Expected total page count (Cover + story pages + End)
              <input
                type="number"
                min={3}
                value={expectedCount}
                onChange={(e) => setExpectedCount(Number.parseInt(e.target.value || "0", 10) || 0)}
                style={{ width: 220, padding: "0.4rem", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff" }}
              />
            </label>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: 12, color: "#475569" }}>
              <span>Total uploaded sheets: {tabs.length}</span>
              <span>Total selected crops: {selectedCount}</span>
              <span>Cover crops: {coverCount}</span>
              <span>Story pages: {pageCount}</span>
              <span>End crops: {endCount}</span>
            </div>
            {countMismatch ? (
              <p style={{ margin: 0, fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
                Expected {expectedCount} pages, but {selectedCount} crop boxes are selected across all tabs.
              </p>
            ) : null}
          </div>

          {activeTab && activeStats && activeTab.result.imageWidth && activeTab.result.imageHeight ? (
            <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.7rem" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#065f46", fontWeight: 700 }}>Active sheet ready.</p>
              <p style={{ margin: "0.3rem 0 0", fontSize: 12, color: "#475569" }}>
                Asset: <code>{activeTab.result.sheetAssetId}</code>
              </p>
              <p style={{ margin: "0.25rem 0 0.7rem", fontSize: 12, color: "#475569" }}>
                Size: {activeTab.result.imageWidth} × {activeTab.result.imageHeight}
              </p>

              <CropOverlayEditor
                key={activeTab.id}
                sheetUrl={activeTab.result.sheetUrl}
                imageWidth={activeTab.result.imageWidth}
                imageHeight={activeTab.result.imageHeight}
                initialCards={activeTab.cards}
                onChange={(nextCards) => updateTabCards(activeTab.id, nextCards)}
                autoOpenOnMount
                hideInlineWorkspace
                modalFooter={
                  <div style={{ display: "grid", gap: "0.45rem" }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
                      <strong>{activeTab.fileName}</strong> has {activeTab.cards.length} crop box{activeTab.cards.length === 1 ? "" : "es"}.
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#334155" }}>
                      Import result preview: <strong>{importSummary}</strong>
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                      New uploads inherit the previous sheet’s crop boxes so you can keep a consistent frame size.
                    </p>
                    <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: 12, color: "#334155" }}>
                      <input type="checkbox" checked={activeTab.reviewConfirmed} onChange={(e) => updateTab(activeTab.id, { reviewConfirmed: e.target.checked })} />
                      I reviewed this tab’s crop boxes and roles.
                    </label>
                    {countMismatch ? (
                      <label style={{ display: "flex", gap: "0.45rem", alignItems: "center", fontSize: 12, color: "#92400e" }}>
                        <input type="checkbox" checked={activeTab.allowMismatchImport} onChange={(e) => updateTab(activeTab.id, { allowMismatchImport: e.target.checked })} />
                        Allow mismatch import for this tab while total selection is {selectedCount} vs expected {expectedCount}.
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={!allReviewed || coverCount !== 1 || endCount !== 1 || (countMismatch && !mismatchAccepted)}
                      onClick={() => {
                        setShowConfirm(true);
                        setImportError("");
                      }}
                      style={{
                        padding: "0.6rem 0.8rem",
                        borderRadius: 8,
                        border: "1px solid #2563eb",
                        background: !allReviewed || coverCount !== 1 || endCount !== 1 || (countMismatch && !mismatchAccepted) ? "#93c5fd" : "#2563eb",
                        color: "#fff",
                        cursor: !allReviewed || coverCount !== 1 || endCount !== 1 || (countMismatch && !mismatchAccepted) ? "not-allowed" : "pointer",
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

      {showConfirm && tabs.length > 0 ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.46)", zIndex: 200, display: "grid", placeItems: "center", padding: "1.2rem" }}>
          <div style={{ width: "min(560px, 100%)", background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(15,23,42,.28)", padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem" }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Confirm Import</h2>
              <button type="button" onClick={() => setShowConfirm(false)} style={{ padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gap: "0.4rem", fontSize: 13, color: "#334155" }}>
              <div>Total sheets: {tabs.length}</div>
              <div>Total crops: {selectedCount}</div>
              <div>Cover crops: {coverCount}</div>
              <div>Story pages: {pageCount}</div>
              <div>End crops: {endCount}</div>
              <div>Expected count: {expectedCount}</div>
              <div>Result preview: {importSummary}</div>
            </div>

            <div style={{ marginTop: "0.8rem", maxHeight: 180, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.6rem", background: "#f8fafc" }}>
              {tabs.map((tab, index) => {
                const stats = tabStats.find((entry) => entry.tabId === tab.id);
                return (
                  <div key={tab.id} style={{ fontSize: 12, color: "#475569", display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.2rem 0" }}>
                    <span>
                      {index + 1}. {tab.fileName}
                    </span>
                    <span>{stats?.selectedCount ?? 0} crops</span>
                  </div>
                );
              })}
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
