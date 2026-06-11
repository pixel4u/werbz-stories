/* eslint-disable react-hooks/refs */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type DetectedCardLabel = "cover" | "end" | "page" | "unknown";

export interface DetectedCard {
  box: { x: number; y: number; width: number; height: number };
  label: DetectedCardLabel;
  pageNumber: number | null;
  confidence: number;
  positionIndex: number;
}

interface CropOverlayEditorProps {
  sheetUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialCards?: DetectedCard[];
  onChange?: (cards: DetectedCard[]) => void;
  autoOpenOnMount?: boolean;
  hideInlineWorkspace?: boolean;
  modalFooter?: ReactNode;
}

type InternalCard = DetectedCard & { _id: string };

type CvLike = {
  Mat: {
    new (...args: unknown[]): CvMatLike;
    ones: (rows: number, cols: number, type: number) => CvMatLike;
  };
  MatVector: new (...args: unknown[]) => CvMatVectorLike;
  Size: new (w: number, h: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  CV_8U: number;
  COLOR_RGBA2GRAY: number;
  BORDER_DEFAULT: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  imread: (canvas: HTMLCanvasElement) => CvMatLike;
  cvtColor: (...args: unknown[]) => void;
  GaussianBlur: (...args: unknown[]) => void;
  Canny: (...args: unknown[]) => void;
  dilate: (...args: unknown[]) => void;
  findContours: (...args: unknown[]) => void;
  boundingRect: (contour: unknown) => { x: number; y: number; width: number; height: number };
};

type CvMatLike = { delete: () => void };
type CvMatVectorLike = { delete: () => void; size: () => number; get: (index: number) => unknown };

declare global {
  interface Window {
    cv?: Record<string, unknown> & { onRuntimeInitialized?: () => void };
  }
}

const THUMB_W = 120;
const THUMB_H = 90;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function nextId(): string {
  return `card-${Math.random().toString(36).slice(2, 10)}`;
}

function parseOcrLabel(text: string): { label: DetectedCardLabel; pageNumber: number | null } {
  const norm = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm) return { label: "unknown", pageNumber: null };
  if (norm.includes("cover") || norm.includes("front")) return { label: "cover", pageNumber: null };
  if (norm.includes("end") || norm.includes("back")) return { label: "end", pageNumber: null };
  const numMatch = norm.match(/(\d{1,3})/);
  if (numMatch) return { label: "page", pageNumber: Number.parseInt(numMatch[1], 10) };
  return { label: "unknown", pageNumber: null };
}

function visualSort(a: DetectedCard, b: DetectedCard): number {
  const rowTolerance = Math.max(14, Math.min(a.box.height, b.box.height) * 0.25);
  if (Math.abs(a.box.y - b.box.y) > rowTolerance) return a.box.y - b.box.y;
  return a.box.x - b.box.x;
}

function normalizeCards(cards: InternalCard[]): InternalCard[] {
  const sorted = [...cards].sort((a, b) => visualSort(a, b));
  return sorted.map((card, idx) => ({ ...card, positionIndex: idx }));
}

function toPublicShape(cards: InternalCard[]): DetectedCard[] {
  return cards.map(({ _id: _unusedId, ...card }) => {
    void _unusedId;
    return card;
  });
}

function buildProposedOrder(cards: InternalCard[]): string[] {
  const covers = cards.filter((c) => c.label === "cover").sort((a, b) => visualSort(a, b));
  const ends = cards.filter((c) => c.label === "end").sort((a, b) => visualSort(a, b));
  const pagesWithNumbers = cards
    .filter((c) => c.label === "page" && c.pageNumber !== null)
    .sort((a, b) => (a.pageNumber as number) - (b.pageNumber as number) || visualSort(a, b));
  const fallbackPool = cards
    .filter((c) => c.label === "unknown" || (c.label === "page" && c.pageNumber === null))
    .sort((a, b) => visualSort(a, b));

  return [...covers, ...pagesWithNumbers, ...fallbackPool, ...ends].map((c) => c._id);
}

async function loadCv(): Promise<CvLike> {
  if (typeof window === "undefined") throw new Error("OpenCV can only load in browser");
  if (window.cv && "Mat" in window.cv) return window.cv as unknown as CvLike;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-opencv-js='1']");
    if (existing) {
      const timeout = window.setTimeout(() => reject(new Error("OpenCV load timeout")), 30000);
      const ready = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      if (window.cv && "Mat" in window.cv) ready();
      else if (window.cv) window.cv.onRuntimeInitialized = ready;
      else existing.addEventListener("load", () => {
        if (window.cv) window.cv.onRuntimeInitialized = ready;
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.async = true;
    script.dataset.opencvJs = "1";
    script.onerror = () => reject(new Error("Failed to load OpenCV.js"));
    script.onload = () => {
      if (window.cv && "Mat" in window.cv) resolve();
      else if (window.cv) window.cv.onRuntimeInitialized = () => resolve();
      else reject(new Error("OpenCV.js did not initialize"));
    };
    document.head.appendChild(script);
  });

  if (!window.cv || !("Mat" in window.cv)) throw new Error("OpenCV unavailable after load");
  return window.cv as unknown as CvLike;
}

async function loadTesseractWorker() {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  });
  return worker;
}

async function detectCardsWithOpenCv(args: {
  sheetUrl: string;
  imageWidth: number;
  imageHeight: number;
}): Promise<DetectedCard[]> {
  const cv = await loadCv();

  const imgEl = new Image();
  imgEl.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    imgEl.onload = () => resolve();
    imgEl.onerror = () => reject(new Error("Failed to load sheet image"));
    imgEl.src = args.sheetUrl;
  });

  const maxDetectWidth = 1400;
  const scaleDown = args.imageWidth > maxDetectWidth ? maxDetectWidth / args.imageWidth : 1;
  const detectW = Math.max(1, Math.round(args.imageWidth * scaleDown));
  const detectH = Math.max(1, Math.round(args.imageHeight * scaleDown));

  const canvas = document.createElement("canvas");
  canvas.width = detectW;
  canvas.height = detectH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create detection canvas");
  ctx.drawImage(imgEl, 0, 0, detectW, detectH);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    cv.Canny(blur, edges, 60, 180);
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = detectW * detectH * 0.01;
    const detected: DetectedCard[] = [];

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const rect = cv.boundingRect(contour);
      const area = rect.width * rect.height;
      if (area < minArea) continue;

      const aspect = rect.width / rect.height;
      if (aspect < 0.45 || aspect > 1.9) continue;

      const x = Math.round(rect.x / scaleDown);
      const y = Math.round(rect.y / scaleDown);
      const width = Math.round(rect.width / scaleDown);
      const height = Math.round(rect.height / scaleDown);

      detected.push({
        box: {
          x: clamp(x, 0, args.imageWidth - 1),
          y: clamp(y, 0, args.imageHeight - 1),
          width: clamp(width, 1, args.imageWidth - x),
          height: clamp(height, 1, args.imageHeight - y),
        },
        label: "unknown",
        pageNumber: null,
        confidence: 0,
        positionIndex: detected.length,
      });
    }

    return detected.sort(visualSort).map((card, idx) => ({ ...card, positionIndex: idx }));
  } finally {
    src.delete();
    gray.delete();
    blur.delete();
    edges.delete();
    dilated.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();
  }
}

async function applyOcrToCards(args: {
  cards: DetectedCard[];
  sheetUrl: string;
  imageWidth: number;
  imageHeight: number;
}): Promise<DetectedCard[]> {
  if (args.cards.length === 0) return [];

  const worker = await loadTesseractWorker();
  const imgEl = new Image();
  imgEl.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    imgEl.onload = () => resolve();
    imgEl.onerror = () => reject(new Error("Failed to load sheet for OCR"));
    imgEl.src = args.sheetUrl;
  });

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = args.imageWidth;
  sourceCanvas.height = args.imageHeight;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) throw new Error("Could not create OCR canvas");
  sourceCtx.drawImage(imgEl, 0, 0, args.imageWidth, args.imageHeight);

  const out: DetectedCard[] = [];
  const maxOcrCards = 30;

  try {
    for (let i = 0; i < args.cards.length; i++) {
      const card = args.cards[i];
      if (i >= maxOcrCards) {
        out.push(card);
        continue;
      }

      const labelRegionW = clamp(Math.round(card.box.width * 0.42), 80, card.box.width);
      const labelRegionH = clamp(Math.round(card.box.height * 0.22), 44, card.box.height);

      const roi = document.createElement("canvas");
      roi.width = labelRegionW;
      roi.height = labelRegionH;
      const roiCtx = roi.getContext("2d");
      if (!roiCtx) {
        out.push(card);
        continue;
      }

      roiCtx.drawImage(sourceCanvas, card.box.x, card.box.y, labelRegionW, labelRegionH, 0, 0, labelRegionW, labelRegionH);
      const { data } = await worker.recognize(roi);
      const parsed = parseOcrLabel(data.text || "");
      out.push({
        ...card,
        label: parsed.label,
        pageNumber: parsed.pageNumber,
        confidence: typeof data.confidence === "number" ? data.confidence : 0,
      });
    }
  } finally {
    await worker.terminate();
  }

  return out.sort(visualSort).map((card, idx) => ({ ...card, positionIndex: idx }));
}

function cropThumbStyle(sheetUrl: string, imageW: number, imageH: number, card: DetectedCard): CSSProperties {
  // Use independent X/Y scaling so the thumbnail maps exactly to the selected crop bounds.
  const scaleX = THUMB_W / card.box.width;
  const scaleY = THUMB_H / card.box.height;
  const bgW = imageW * scaleX;
  const bgH = imageH * scaleY;
  return {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    backgroundImage: `url(${sheetUrl})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${bgW}px ${bgH}px`,
    backgroundPosition: `${-card.box.x * scaleX}px ${-card.box.y * scaleY}px`,
    backgroundColor: "#fff",
  };
}

export function CropOverlayEditor({
  sheetUrl,
  imageWidth,
  imageHeight,
  initialCards,
  onChange,
  autoOpenOnMount = false,
  hideInlineWorkspace = false,
  modalFooter,
}: CropOverlayEditorProps) {
  const [cards, setCards] = useState<InternalCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranDetection, setRanDetection] = useState(false);
  const [manualOrderIds, setManualOrderIds] = useState<string[] | null>(null);
  const [gridCols, setGridCols] = useState(3);
  const [gridRows, setGridRows] = useState(4);
  const [gridMargin, setGridMargin] = useState(24);
  const [gridGutter, setGridGutter] = useState(12);
  const [inlineDisplaySize, setInlineDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [modalDisplaySize, setModalDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(autoOpenOnMount);
  const didAutoOpenRef = useRef(false);
  const editRef = useRef<{
    mode: "move" | "resize";
    id: string;
    handle?: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
    startClientX: number;
    startClientY: number;
    startBox: { x: number; y: number; width: number; height: number };
  } | null>(null);

  useEffect(() => {
    onChange?.(toPublicShape(cards));
  }, [cards, onChange]);

  useEffect(() => {
    const seeded = Array.isArray(initialCards) ? initialCards : [];
    const nextCards = normalizeCards(
      seeded.map((card) => ({
        ...card,
        _id: nextId(),
      }))
    );
    setCards(nextCards);
    setManualOrderIds(null);
    setSelectedId(nextCards[0]?._id ?? null);
    setRanDetection(nextCards.length > 0);
    setError(null);
  }, [initialCards, sheetUrl]);

  useEffect(() => {
    if (autoOpenOnMount && !didAutoOpenRef.current) {
      setIsFullscreen(true);
      didAutoOpenRef.current = true;
    }
  }, [autoOpenOnMount]);

  const measureDisplayedImageFromElement = useCallback((element: HTMLImageElement, surface: "inline" | "modal") => {
    const rect = element.getBoundingClientRect();
    if (surface === "modal") setModalDisplaySize({ width: rect.width, height: rect.height });
    else setInlineDisplaySize({ width: rect.width, height: rect.height });
  }, []);

  const cardById = useMemo(() => new Map(cards.map((c) => [c._id, c])), [cards]);
  const proposedOrderIds = useMemo(() => buildProposedOrder(cards), [cards]);

  const effectiveOrderIds = useMemo(() => {
    if (!manualOrderIds) return proposedOrderIds;
    const cleaned = manualOrderIds.filter((id) => cardById.has(id));
    const missing = cards.map((c) => c._id).filter((id) => !cleaned.includes(id));
    return [...cleaned, ...missing];
  }, [manualOrderIds, proposedOrderIds, cardById, cards]);

  const orderedCards = useMemo(() => effectiveOrderIds.map((id) => cardById.get(id)).filter((c): c is InternalCard => Boolean(c)), [effectiveOrderIds, cardById]);

  const activeDisplaySize = isFullscreen ? modalDisplaySize : inlineDisplaySize;
  const scaleX = activeDisplaySize.width > 0 ? activeDisplaySize.width / imageWidth : 1;
  const scaleY = activeDisplaySize.height > 0 ? activeDisplaySize.height / imageHeight : 1;

  const lowConfidenceCount = useMemo(() => cards.filter((c) => c.confidence > 0 && c.confidence < 50).length, [cards]);
  const coverCount = useMemo(() => cards.filter((c) => c.label === "cover").length, [cards]);
  const endCount = useMemo(() => cards.filter((c) => c.label === "end").length, [cards]);
  const missingPageNumbers = useMemo(() => cards.filter((c) => c.label === "page" && c.pageNumber === null).length, [cards]);
  const unknownCount = useMemo(() => cards.filter((c) => c.label === "unknown").length, [cards]);

  function setCardsFromDetected(next: DetectedCard[]) {
    const internal = normalizeCards(next.map((c) => ({ ...c, _id: nextId() })));
    setCards(internal);
    setManualOrderIds(null);
  }

  async function runDetection() {
    setBusy(true);
    setError(null);
    setRanDetection(true);
    try {
      const detected = await detectCardsWithOpenCv({ sheetUrl, imageWidth, imageHeight });
      const withOcr = await applyOcrToCards({ cards: detected, sheetUrl, imageWidth, imageHeight });
      setCardsFromDetected(withOcr);
    } catch (e) {
      setCards([]);
      setManualOrderIds(null);
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setBusy(false);
    }
  }

  function updateCard(id: string, patch: Partial<DetectedCard>) {
    setCards((prev) => normalizeCards(prev.map((c) => (c._id === id ? { ...c, ...patch } : c))));
  }

  const updateCardBox = useCallback((
    id: string,
    updater: (box: { x: number; y: number; width: number; height: number }) => { x: number; y: number; width: number; height: number }
  ) => {
    const minSize = 20;
    setCards((prev) =>
      normalizeCards(
        prev.map((c) => {
          if (c._id !== id) return c;
          const next = updater(c.box);
          const clampedX = clamp(next.x, 0, imageWidth - minSize);
          const clampedY = clamp(next.y, 0, imageHeight - minSize);
          const clampedW = clamp(next.width, minSize, imageWidth - clampedX);
          const clampedH = clamp(next.height, minSize, imageHeight - clampedY);
          return { ...c, box: { x: clampedX, y: clampedY, width: clampedW, height: clampedH } };
        })
      )
    );
  }, [imageHeight, imageWidth]);

  function deleteCard(id: string) {
    setCards((prev) => normalizeCards(prev.filter((c) => c._id !== id)));
    setManualOrderIds((prev) => (prev ? prev.filter((x) => x !== id) : prev));
    setSelectedId((prev) => (prev === id ? null : prev));
  }

  function addCardManually() {
    const width = Math.round(imageWidth * 0.22);
    const height = Math.round(imageHeight * 0.28);
    const x = Math.round((imageWidth - width) / 2);
    const y = Math.round((imageHeight - height) / 2);

    setCards((prev) =>
      normalizeCards([
        ...prev,
        {
          _id: nextId(),
          box: { x, y, width, height },
          label: "unknown",
          pageNumber: null,
          confidence: 0,
          positionIndex: prev.length,
        },
      ])
    );
    setSelectedId(null);
  }

  function applyProposedSort() {
    setManualOrderIds(null);
  }

  function moveCard(id: string, dir: -1 | 1) {
    const base = manualOrderIds ?? proposedOrderIds;
    const idx = base.indexOf(id);
    if (idx < 0) return;
    const next = [...base];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setManualOrderIds(next);
  }

  function generateGridFallback() {
    const cols = clamp(Math.round(gridCols), 1, 20);
    const rows = clamp(Math.round(gridRows), 1, 40);
    const margin = clamp(Math.round(gridMargin), 0, Math.min(imageWidth, imageHeight) / 4);
    const gutter = clamp(Math.round(gridGutter), 0, Math.min(imageWidth, imageHeight) / 8);

    const usableW = imageWidth - margin * 2 - gutter * (cols - 1);
    const usableH = imageHeight - margin * 2 - gutter * (rows - 1);
    if (usableW <= 0 || usableH <= 0) {
      setError("Grid settings are too large for this image size.");
      return;
    }

    const cellW = Math.floor(usableW / cols);
    const cellH = Math.floor(usableH / rows);
    if (cellW < 20 || cellH < 20) {
      setError("Grid cells are too small. Reduce rows/cols or margins.");
      return;
    }

    const generated: DetectedCard[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = margin + c * (cellW + gutter);
        const y = margin + r * (cellH + gutter);
        generated.push({
          box: { x, y, width: cellW, height: cellH },
          label: "unknown",
          pageNumber: null,
          confidence: 0,
          positionIndex: generated.length,
        });
      }
    }

    setError(null);
    setRanDetection(true);
    setCardsFromDetected(generated);
    setSelectedId(null);
  }

  function beginMove(id: string, event: React.PointerEvent<HTMLDivElement>) {
    const card = cardById.get(id);
    if (!card) return;
    setSelectedId(id);
    event.preventDefault();
    event.stopPropagation();
    editRef.current = {
      mode: "move",
      id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: { ...card.box },
    };
  }

  function beginResize(id: string, handle: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se", event: React.PointerEvent<HTMLDivElement>) {
    const card = cardById.get(id);
    if (!card) return;
    setSelectedId(id);
    event.preventDefault();
    event.stopPropagation();
    editRef.current = {
      mode: "resize",
      id,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: { ...card.box },
    };
  }

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const edit = editRef.current;
      if (!edit) return;
      const dx = scaleX === 0 ? 0 : (event.clientX - edit.startClientX) / scaleX;
      const dy = scaleY === 0 ? 0 : (event.clientY - edit.startClientY) / scaleY;
      if (edit.mode === "move") {
        updateCardBox(edit.id, (box) => ({ ...box, x: Math.round(edit.startBox.x + dx), y: Math.round(edit.startBox.y + dy) }));
        return;
      }
      const handle = edit.handle ?? "se";
      updateCardBox(edit.id, () => {
        let x = edit.startBox.x;
        let y = edit.startBox.y;
        let width = edit.startBox.width;
        let height = edit.startBox.height;
        if (handle.includes("e")) width = Math.round(edit.startBox.width + dx);
        if (handle.includes("s")) height = Math.round(edit.startBox.height + dy);
        if (handle.includes("w")) {
          x = Math.round(edit.startBox.x + dx);
          width = Math.round(edit.startBox.width - dx);
        }
        if (handle.includes("n")) {
          y = Math.round(edit.startBox.y + dy);
          height = Math.round(edit.startBox.height - dy);
        }
        return { x, y, width, height };
      });
    }
    function onUp() {
      editRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scaleX, scaleY, updateCardBox]);

  const resizeHandles: Array<{ key: "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se"; style: CSSProperties; cursor: string }> = [
    { key: "nw", style: { left: -8, top: -8 }, cursor: "nwse-resize" },
    { key: "ne", style: { right: -8, top: -8 }, cursor: "nesw-resize" },
    { key: "sw", style: { left: -8, bottom: -8 }, cursor: "nesw-resize" },
    { key: "se", style: { right: -8, bottom: -8 }, cursor: "nwse-resize" },
    { key: "n", style: { left: "50%", top: -8, transform: "translateX(-50%)" }, cursor: "ns-resize" },
    { key: "s", style: { left: "50%", bottom: -8, transform: "translateX(-50%)" }, cursor: "ns-resize" },
    { key: "e", style: { right: -8, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
    { key: "w", style: { left: -8, top: "50%", transform: "translateY(-50%)" }, cursor: "ew-resize" },
  ];

  return (
    <div style={{ border: "1px solid #dbe3ef", borderRadius: 10, padding: "0.75rem", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>Detection Preview</strong>
        <div style={{ display: "flex", gap: "0.45rem" }}>
          <button type="button" onClick={runDetection} disabled={busy} style={{ padding: "0.4rem 0.65rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            {busy ? "Detecting..." : "Run detection"}
          </button>
          <button type="button" onClick={addCardManually} style={{ padding: "0.4rem 0.65rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12 }}>
            Add box
          </button>
          <button type="button" onClick={applyProposedSort} style={{ padding: "0.4rem 0.65rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12 }}>
            Re-sort by role/number
          </button>
          <button type="button" onClick={() => setIsFullscreen(true)} style={{ padding: "0.4rem 0.65rem", borderRadius: 8, border: "1px solid #1d4ed8", background: "#dbeafe", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Full screen editor
          </button>
        </div>
      </div>

      <p style={{ margin: "0.4rem 0 0.6rem", fontSize: 12, color: "#64748b" }}>
        Ordering rule: Cover first, End last, numbered pages ascending, then visual-position fallback.
      </p>

      {!hideInlineWorkspace ? <div style={{ position: "relative", width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#f8fafc", maxHeight: 560 }}>
        <img src={sheetUrl} alt="Contact sheet" onLoad={(event) => measureDisplayedImageFromElement(event.target as HTMLImageElement, "inline")} style={{ width: "100%", height: "auto", display: "block" }} />
        {inlineDisplaySize.width > 0
          ? cards.map((card) => {
              const left = card.box.x * scaleX;
              const top = card.box.y * scaleY;
              const width = card.box.width * scaleX;
              const height = card.box.height * scaleY;
              const isSelected = selectedId === card._id;
              return (
                <div
                  key={card._id}
                  onPointerDown={(event) => beginMove(card._id, event)}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedId(card._id);
                  }}
                  style={{ position: "absolute", left, top, width, height, border: isSelected ? "3px solid #2563eb" : "2px solid #60a5fa", boxShadow: "0 0 0 1px rgba(255,255,255,0.7) inset", cursor: "move", pointerEvents: "auto" }}
                >
                  <div style={{ position: "absolute", top: -28, left: 0, display: "flex", gap: 4, alignItems: "center", background: isSelected ? "#1d4ed8" : "#2563eb", color: "#fff", borderRadius: 6, padding: "2px 6px" }}>
                    <select
                      value={card.label}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(e) => updateCard(card._id, { label: e.target.value as DetectedCardLabel })}
                      style={{ fontSize: 11, fontWeight: 700, border: "none", background: "transparent", color: "#fff", outline: "none" }}
                    >
                      <option value="cover" style={{ color: "#0f172a" }}>Cover</option>
                      <option value="page" style={{ color: "#0f172a" }}>Page</option>
                      <option value="end" style={{ color: "#0f172a" }}>End</option>
                      <option value="unknown" style={{ color: "#0f172a" }}>Unknown</option>
                    </select>
                    {card.label === "page" ? (
                      <input
                        type="number"
                        value={card.pageNumber ?? ""}
                        onPointerDown={(event) => event.stopPropagation()}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const num = raw ? Number.parseInt(raw, 10) : null;
                          updateCard(card._id, { pageNumber: Number.isFinite(num as number) ? (num as number) : null });
                        }}
                        placeholder="#"
                        style={{ width: 48, fontSize: 11, border: "none", borderRadius: 4, padding: "1px 4px" }}
                      />
                    ) : null}
                  </div>
                  {isSelected
                    ? resizeHandles.map((handle) => (
                        <div
                          key={`${card._id}-${handle.key}`}
                          onPointerDown={(event) => beginResize(card._id, handle.key, event)}
                          style={{ position: "absolute", width: 16, height: 16, borderRadius: 999, background: "#fff", border: "2px solid #1d4ed8", ...handle.style, cursor: handle.cursor }}
                        />
                      ))
                    : null}
                </div>
              );
            })
          : null}
      </div> : null}

      {!hideInlineWorkspace && !isFullscreen ? <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.35rem" }}>
        <div style={{ fontSize: 12, color: "#334155" }}>Detected {cards.length} pages</div>
        {coverCount === 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: No Cover detected.</div> : null}
        {endCount === 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: No End detected.</div> : null}
        {coverCount > 1 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: Duplicate Cover detected.</div> : null}
        {endCount > 1 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: Duplicate End detected.</div> : null}
        {missingPageNumbers > 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: {missingPageNumbers} page cards are missing page numbers.</div> : null}
        {lowConfidenceCount > 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: {lowConfidenceCount} labels have low OCR confidence.</div> : null}
        {unknownCount > 0 ? <div style={{ fontSize: 12, color: "#64748b" }}>Note: {unknownCount} unread boxes will use fallback visual order.</div> : null}
        {ranDetection && cards.length === 0 ? <div style={{ fontSize: 12, color: "#64748b" }}>We couldn’t detect pages clearly. Use Grid Fallback below.</div> : null}
        {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
      </div> : null}

      {!hideInlineWorkspace && !isFullscreen ? <div style={{ marginTop: "0.8rem", borderTop: "1px solid #e5e7eb", paddingTop: "0.75rem" }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: "0.5rem" }}>Grid Fallback</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr)) auto", gap: "0.45rem", alignItems: "end" }}>
          <label style={{ fontSize: 12 }}>Columns<input type="number" min={1} value={gridCols} onChange={(e) => setGridCols(Number.parseInt(e.target.value || "1", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Rows<input type="number" min={1} value={gridRows} onChange={(e) => setGridRows(Number.parseInt(e.target.value || "1", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Margin(px)<input type="number" min={0} value={gridMargin} onChange={(e) => setGridMargin(Number.parseInt(e.target.value || "0", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Gutter(px)<input type="number" min={0} value={gridGutter} onChange={(e) => setGridGutter(Number.parseInt(e.target.value || "0", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
          <button type="button" onClick={generateGridFallback} style={{ padding: "0.48rem 0.7rem", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Generate Grid</button>
        </div>
        <p style={{ margin: "0.4rem 0 0", fontSize: 12, color: "#64748b" }}>
          Current grid settings will create <strong>{Math.max(1, Math.round(gridCols)) * Math.max(1, Math.round(gridRows))}</strong> crop boxes.
        </p>
      </div> : null}

      {!hideInlineWorkspace && !isFullscreen && orderedCards.length > 0 ? (
        <div style={{ marginTop: "0.85rem", borderTop: "1px solid #e5e7eb", paddingTop: "0.8rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <strong style={{ fontSize: 13 }}>Review Strip</strong>
            <span style={{ fontSize: 12, color: "#64748b" }}>Manual order {manualOrderIds ? "enabled" : "using proposed sort"}</span>
          </div>
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {orderedCards.map((card, idx) => (
              <div
                key={`review-${card._id}`}
                onClick={() => setSelectedId(card._id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 130px 100px 90px 1fr auto auto auto auto",
                  gap: "0.45rem",
                  alignItems: "center",
                  border: selectedId === card._id ? "2px solid #2563eb" : "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "0.45rem",
                  background: selectedId === card._id ? "#eff6ff" : "#fff",
                }}
              >
                <div style={{ fontSize: 11, color: "#64748b", width: 22, textAlign: "center" }}>{idx + 1}</div>
                <div style={cropThumbStyle(sheetUrl, imageWidth, imageHeight, card)} />
                <select value={card.label} onChange={(e) => updateCard(card._id, { label: e.target.value as DetectedCardLabel })} style={{ padding: "0.35rem", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
                  <option value="cover">Cover</option>
                  <option value="page">Page</option>
                  <option value="end">End</option>
                  <option value="unknown">Unknown</option>
                </select>
                <input type="number" value={card.pageNumber ?? ""} onChange={(e) => {
                  const raw = e.target.value.trim();
                  const num = raw ? Number.parseInt(raw, 10) : null;
                  updateCard(card._id, { pageNumber: Number.isFinite(num as number) ? (num as number) : null });
                }} placeholder="Page #" style={{ padding: "0.35rem", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }} />
                <div style={{ fontSize: 11, color: card.confidence > 0 && card.confidence < 50 ? "#b45309" : "#64748b" }}>
                  conf {card.confidence.toFixed(1)} • x:{card.box.x} y:{card.box.y}
                </div>
                <button type="button" disabled={idx === 0} onClick={() => moveCard(card._id, -1)} style={{ padding: "0.3rem 0.45rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: idx === 0 ? "not-allowed" : "pointer", fontSize: 12 }}>◀</button>
                <button type="button" disabled={idx === orderedCards.length - 1} onClick={() => moveCard(card._id, 1)} style={{ padding: "0.3rem 0.45rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: idx === orderedCards.length - 1 ? "not-allowed" : "pointer", fontSize: 12 }}>▶</button>
                <button type="button" onClick={() => deleteCard(card._id)} style={{ padding: "0.3rem 0.45rem", borderRadius: 6, border: "1px solid #ef4444", background: "#fff", color: "#b91c1c", cursor: "pointer", fontSize: 12 }}>Delete</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isFullscreen ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(15,23,42,.82)", padding: "1rem", display: "grid" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: "0.8rem", display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <strong>Full-screen Crop Frame Editor</strong>
              <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                <button type="button" onClick={runDetection} disabled={busy} style={{ padding: "0.4rem 0.65rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  {busy ? "Detecting..." : "Run detection"}
                </button>
                <button type="button" onClick={addCardManually} style={{ padding: "0.4rem 0.65rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                  Add frame
                </button>
                <button type="button" onClick={applyProposedSort} style={{ padding: "0.4rem 0.65rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 12 }}>
                  Re-sort
                </button>
                <button type="button" onClick={() => setIsFullscreen(false)} style={{ padding: "0.45rem 0.75rem", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }}>
                  Close
                </button>
              </div>
            </div>
            <div style={{ overflow: "hidden", display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: "0.8rem" }}>
              <div style={{ overflow: "auto", minHeight: "80vh" }}>
                <div style={{ position: "relative", width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#f8fafc" }}>
                  <img src={sheetUrl} alt="Contact sheet full size" onLoad={(event) => measureDisplayedImageFromElement(event.target as HTMLImageElement, "modal")} style={{ width: "100%", height: "auto", display: "block" }} />
                  {modalDisplaySize.width > 0
                    ? cards.map((card) => {
                        const left = card.box.x * scaleX;
                        const top = card.box.y * scaleY;
                        const width = card.box.width * scaleX;
                        const height = card.box.height * scaleY;
                        const isSelected = selectedId === card._id;
                        return (
                          <div
                            key={`full-${card._id}`}
                            onPointerDown={(event) => beginMove(card._id, event)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(card._id);
                            }}
                            style={{ position: "absolute", left, top, width, height, border: isSelected ? "3px solid #2563eb" : "2px solid #60a5fa", boxShadow: "0 0 0 1px rgba(255,255,255,0.7) inset", cursor: "move", pointerEvents: "auto" }}
                          >
                            <div style={{ position: "absolute", top: -30, left: 0, display: "flex", gap: 4, alignItems: "center", background: isSelected ? "#1d4ed8" : "#2563eb", color: "#fff", borderRadius: 6, padding: "2px 6px" }}>
                              <select
                                value={card.label}
                                onPointerDown={(event) => event.stopPropagation()}
                                onChange={(e) => updateCard(card._id, { label: e.target.value as DetectedCardLabel })}
                                style={{ fontSize: 11, fontWeight: 700, border: "none", background: "transparent", color: "#fff", outline: "none" }}
                              >
                                <option value="cover" style={{ color: "#0f172a" }}>Cover</option>
                                <option value="page" style={{ color: "#0f172a" }}>Page</option>
                                <option value="end" style={{ color: "#0f172a" }}>End</option>
                                <option value="unknown" style={{ color: "#0f172a" }}>Unknown</option>
                              </select>
                              {card.label === "page" ? (
                                <input
                                  type="number"
                                  value={card.pageNumber ?? ""}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    const num = raw ? Number.parseInt(raw, 10) : null;
                                    updateCard(card._id, { pageNumber: Number.isFinite(num as number) ? (num as number) : null });
                                  }}
                                  placeholder="#"
                                  style={{ width: 52, fontSize: 11, border: "none", borderRadius: 4, padding: "1px 4px" }}
                                />
                              ) : null}
                            </div>
                            {isSelected
                              ? resizeHandles.map((handle) => (
                                  <div
                                    key={`full-${card._id}-${handle.key}`}
                                    onPointerDown={(event) => beginResize(card._id, handle.key, event)}
                                    style={{ position: "absolute", width: 16, height: 16, borderRadius: 999, background: "#fff", border: "2px solid #1d4ed8", ...handle.style, cursor: handle.cursor }}
                                  />
                                ))
                              : null}
                          </div>
                        );
                      })
                    : null}
                </div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: "0.7rem", overflow: "auto", background: "#fff" }}>
                <div style={{ marginBottom: "0.6rem", display: "grid", gap: "0.35rem" }}>
                  <div style={{ fontSize: 12, color: "#334155" }}>Detected {cards.length} pages</div>
                  {coverCount === 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: No Cover detected.</div> : null}
                  {endCount === 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: No End detected.</div> : null}
                  {coverCount > 1 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: Duplicate Cover detected.</div> : null}
                  {endCount > 1 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: Duplicate End detected.</div> : null}
                  {missingPageNumbers > 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: {missingPageNumbers} page cards are missing page numbers.</div> : null}
                  {lowConfidenceCount > 0 ? <div style={{ fontSize: 12, color: "#b45309" }}>Warning: {lowConfidenceCount} labels have low OCR confidence.</div> : null}
                  {unknownCount > 0 ? <div style={{ fontSize: 12, color: "#64748b" }}>Note: {unknownCount} unread boxes will use fallback visual order.</div> : null}
                  {ranDetection && cards.length === 0 ? <div style={{ fontSize: 12, color: "#64748b" }}>We couldn’t detect pages clearly. Use Grid Fallback below.</div> : null}
                  {error ? <div style={{ fontSize: 12, color: "#b91c1c" }}>{error}</div> : null}
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.6rem", marginBottom: "0.7rem" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: "0.45rem" }}>Grid Generation</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "0.45rem" }}>
                    <label style={{ fontSize: 12 }}>Columns<input type="number" min={1} value={gridCols} onChange={(e) => setGridCols(Number.parseInt(e.target.value || "1", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>Rows<input type="number" min={1} value={gridRows} onChange={(e) => setGridRows(Number.parseInt(e.target.value || "1", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>Margin(px)<input type="number" min={0} value={gridMargin} onChange={(e) => setGridMargin(Number.parseInt(e.target.value || "0", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
                    <label style={{ fontSize: 12 }}>Gutter(px)<input type="number" min={0} value={gridGutter} onChange={(e) => setGridGutter(Number.parseInt(e.target.value || "0", 10))} style={{ width: "100%", marginTop: 4, padding: "0.35rem", border: "1px solid #d1d5db", borderRadius: 6 }} /></label>
                  </div>
                  <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Will create <strong>{Math.max(1, Math.round(gridCols)) * Math.max(1, Math.round(gridRows))}</strong> boxes
                    </div>
                    <button type="button" onClick={generateGridFallback} style={{ padding: "0.45rem 0.7rem", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                      Generate Grid
                    </button>
                  </div>
                </div>

                {orderedCards.length > 0 ? (
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.6rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.45rem" }}>
                      <strong style={{ fontSize: 13 }}>Crop Preview / Order</strong>
                      <span style={{ fontSize: 12, color: "#64748b" }}>{manualOrderIds ? "manual" : "auto"}</span>
                    </div>
                    <div style={{ display: "grid", gap: "0.5rem" }}>
                      {orderedCards.map((card, idx) => (
                        <div
                          key={`modal-review-${card._id}`}
                          onClick={() => setSelectedId(card._id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "22px 90px 90px 70px auto",
                            gap: "0.4rem",
                            alignItems: "center",
                            border: selectedId === card._id ? "2px solid #2563eb" : "1px solid #e5e7eb",
                            borderRadius: 8,
                            padding: "0.4rem",
                            background: selectedId === card._id ? "#eff6ff" : "#fff",
                          }}
                        >
                          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>{idx + 1}</div>
                          <div style={cropThumbStyle(sheetUrl, imageWidth, imageHeight, card)} />
                          <select value={card.label} onChange={(e) => updateCard(card._id, { label: e.target.value as DetectedCardLabel })} style={{ padding: "0.35rem", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}>
                            <option value="cover">Cover</option>
                            <option value="page">Page</option>
                            <option value="end">End</option>
                            <option value="unknown">Unknown</option>
                          </select>
                          <input
                            type="number"
                            value={card.pageNumber ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              const num = raw ? Number.parseInt(raw, 10) : null;
                              updateCard(card._id, { pageNumber: Number.isFinite(num as number) ? (num as number) : null });
                            }}
                            placeholder="#"
                            style={{ padding: "0.35rem", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 }}
                          />
                          <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end" }}>
                            <button type="button" disabled={idx === 0} onClick={() => moveCard(card._id, -1)} style={{ padding: "0.28rem 0.4rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: idx === 0 ? "not-allowed" : "pointer", fontSize: 12 }}>◀</button>
                            <button type="button" disabled={idx === orderedCards.length - 1} onClick={() => moveCard(card._id, 1)} style={{ padding: "0.28rem 0.4rem", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: idx === orderedCards.length - 1 ? "not-allowed" : "pointer", fontSize: 12 }}>▶</button>
                            <button type="button" onClick={() => deleteCard(card._id)} style={{ padding: "0.28rem 0.4rem", borderRadius: 6, border: "1px solid #ef4444", background: "#fff", color: "#b91c1c", cursor: "pointer", fontSize: 12 }}>Del</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {modalFooter ? (
                  <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
                    {modalFooter}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
