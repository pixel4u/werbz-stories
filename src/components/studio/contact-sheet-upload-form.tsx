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
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function nextTabId(): string {
  return `sheet-${Math.random().toString(36).slice(2, 10)}`;
}

export function ContactSheetUploadForm({ storybookId }: ContactSheetUploadFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [duplicateTargetId, setDuplicateTargetId] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;

  async function uploadOneFile(file: File) {
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

    return {
      id: nextTabId(),
      fileName: file.name,
      result,
      cards: [],
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
      for (const file of allFiles) {
        const newTab = await uploadOneFile(file);
        createdTabs.push(newTab);
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
        return {
          ...tab,
          cards: nextCards,
        };
      })
    );
  }

  function duplicateFramesToTarget() {
    if (!activeTab || !duplicateTargetId || duplicateTargetId === activeTab.id) return;
    const copiedCards = activeTab.cards.map((card, idx) => ({
      ...card,
      box: { ...card.box },
      positionIndex: idx,
    }));

    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === duplicateTargetId
          ? {
              ...tab,
              cards: copiedCards,
            }
          : tab
      )
    );
  }

  const tabStats = useMemo(
    () =>
      tabs.map((tab) => {
        const ordered = [...tab.cards].sort((a, b) => a.positionIndex - b.positionIndex);
        const coverCount = ordered.filter((c) => c.label === "cover").length;
        const endCount = ordered.filter((c) => c.label === "end").length;
        const pageCount = ordered.filter((c) => c.label === "page").length;
        const selectedCount = coverCount + endCount + pageCount;
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

  const duplicateTargets = tabs.filter((tab) => tab.id !== activeTabId);
  const coverCount = tabStats.reduce((sum, stats) => sum + stats.coverCount, 0);
  const endCount = tabStats.reduce((sum, stats) => sum + stats.endCount, 0);
  const pageCount = tabStats.reduce((sum, stats) => sum + stats.pageCount, 0);
  const selectedCount = tabStats.reduce((sum, stats) => sum + stats.selectedCount, 0);
  const validSheetCount = tabs.filter((tab) => tab.cards.some((c) => c.label === "cover" || c.label === "page" || c.label === "end")).length;
  const importSummary = `Cover + ${pageCount} story page${pageCount === 1 ? "" : "s"} + End`;
  const importDisabled = importBusy || tabs.length === 0 || selectedCount < 2 || coverCount !== 1 || endCount !== 1;

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
          mode: "new",
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

  if (!activeTab || !activeTab.result.imageWidth || !activeTab.result.imageHeight) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: 320, padding: "1rem" }}>
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
            width: "min(560px, 100%)",
            border: dragOver ? "2px solid #2563eb" : "1px dashed #94a3b8",
            borderRadius: 18,
            padding: "2rem",
            background: dragOver ? "#eff6ff" : "#f8fafc",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b", fontWeight: 700 }}>Import Contact Sheet</div>
          <h3 style={{ margin: "0.7rem 0 0.4rem", fontSize: 28, lineHeight: 1.1 }}>Upload one or more PNG sheets</h3>
          <p style={{ margin: "0 auto 1.1rem", maxWidth: 420, fontSize: 14, color: "#64748b" }}>
            Each PNG becomes its own tab in the full-screen crop editor. Add frames, run detection, and import once your cover, pages, and end are ready.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: "0.85rem 1.1rem", borderRadius: 999, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 700 }}
            >
              {busy ? "Uploading..." : "Choose files"}
            </button>
            <span style={{ alignSelf: "center", fontSize: 13, color: "#64748b" }}>or drag files here</span>
          </div>
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
            style={{ display: "none" }}
          />
          {error ? <p style={{ margin: "0.9rem 0 0", fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <CropOverlayEditor
      key={activeTab.id}
      sheetUrl={activeTab.result.sheetUrl}
      imageWidth={activeTab.result.imageWidth}
      imageHeight={activeTab.result.imageHeight}
      initialCards={activeTab.cards}
      onChange={(nextCards) => updateTabCards(activeTab.id, nextCards)}
      autoOpenOnMount
      hideInlineWorkspace
      modalHeader={
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginRight: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.4rem", maxWidth: 560, overflowX: "auto", paddingBottom: 2 }}>
            {tabs.map((tab, index) => {
              const isActive = tab.id === activeTabId;
              const stats = tabStats.find((entry) => entry.tabId === tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  style={{
                    flex: "0 0 auto",
                    display: "grid",
                    gap: 2,
                    minWidth: 140,
                    padding: "0.45rem 0.6rem",
                    borderRadius: 10,
                    border: isActive ? "1px solid #2563eb" : "1px solid #d1d5db",
                    background: isActive ? "#eff6ff" : "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 10, color: isActive ? "#1d4ed8" : "#64748b", fontWeight: 700 }}>Tab {index + 1}</span>
                  <span style={{ fontSize: 12, color: "#0f172a", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tab.fileName}</span>
                  <span style={{ fontSize: 10, color: "#64748b" }}>{stats?.selectedCount ?? 0} crops</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
          >
            {busy ? "Uploading..." : "Upload another PNG"}
          </button>
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
            style={{ display: "none" }}
          />
        </div>
      }
      modalFooter={
        <div style={{ display: "grid", gap: "0.7rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: 12, color: "#475569" }}>
              <span>Total sheets: {tabs.length}</span>
              <span>Sheets with crops: {validSheetCount}</span>
              <span>Total crops: {selectedCount}</span>
              <span>Cover crops: {coverCount}</span>
              <span>Story pages: {pageCount}</span>
              <span>End crops: {endCount}</span>
            </div>
            <button
              type="button"
              disabled={importDisabled}
              onClick={importBook}
              style={{
                padding: "0.7rem 1rem",
                borderRadius: 8,
                border: "1px solid #2563eb",
                background: importDisabled ? "#93c5fd" : "#2563eb",
                color: "#fff",
                cursor: importDisabled ? "not-allowed" : "pointer",
                fontWeight: 700,
                minWidth: 140,
              }}
            >
              {importBusy ? "Importing..." : "Import Book"}
            </button>
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", fontSize: 12, color: "#475569" }}>
            <span>Import needs exactly 1 Cover and 1 End</span>
            <span>{selectedCount < 2 ? "Add at least two valid crops to import" : "Frames look import-ready when roles are valid"}</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#334155" }}>
            Import result preview: <strong>{importSummary}</strong>
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
            Run detection and edit boxes here in full screen. Each PNG tab keeps its own frame state until import time.
          </p>
          {error ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
          {importError ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{importError}</p> : null}
          {duplicateTargets.length > 0 ? (
            <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={duplicateTargetId}
                onChange={(e) => setDuplicateTargetId(e.target.value)}
                style={{ padding: "0.45rem 0.6rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 12 }}
              >
                <option value="">Copy frames to another PNG</option>
                {duplicateTargets.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    Tab {tabs.findIndex((entry) => entry.id === tab.id) + 1}: {tab.fileName}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!duplicateTargetId}
                onClick={duplicateFramesToTarget}
                style={{
                  padding: "0.45rem 0.75rem",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: !duplicateTargetId ? "#f3f4f6" : "#fff",
                  cursor: !duplicateTargetId ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Duplicate frames to selected PNG
              </button>
            </div>
          ) : null}
        </div>
      }
    />
  );
}
