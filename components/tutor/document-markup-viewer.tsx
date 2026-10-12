"use client";

import { memo, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Download, Eraser, Highlighter, Loader2, MessageSquare,
  MousePointer2, PenLine, Trash2, Undo2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A tutor's markup surface for one submission: comments, highlights, and
 * freehand drawing over a PDF or docx, plus zoom. PDFs are rendered to a
 * canvas with PDF.js (re-rendered at each zoom level, so text stays sharp);
 * docx is rendered to HTML with docx-preview. Both get the same annotation
 * overlay on top.
 *
 * Every annotation position is stored as a percentage (0-100) of the page /
 * document box, not pixels — so it stays aligned at any zoom level.
 */

export interface Annotation {
  id: number;
  kind: "comment" | "highlight" | "draw";
  page: number;
  paragraphIndex: number | null;
  x: number;
  y: number;
  color: string;
  body: string | null;
  strokePoints: string | null;
  mine: boolean;
  createdAt: string;
}

type Tool = "none" | "comment" | "highlight" | "draw" | "erase";
type Point = { x: number; y: number };
/** One undoable action by this tutor in this session. */
type HistoryEntry = { type: "add" | "remove"; annotation: Annotation };

const COLORS = ["#facc15", "#f87171", "#4ade80", "#60a5fa", "#c084fc", "#fb923c"];
const PAGE_WIDTH = 800;
const LETTER_ASPECT = 1035 / 800; // placeholder until the real page size is known
/** Minimum distance (in % of the page) between stored stroke points. */
const MIN_POINT_GAP = 0.15;
/** Pen width in screen pixels (non-scaling, so the stretched 0-100 viewBox can't distort it). */
const STROKE_PX = 4;

function parseStrokePoints(raw: string | null): Point[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.x === "number" && typeof p?.y === "number") : [];
  } catch {
    return [];
  }
}

const toPolylinePoints = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

// ─── PDF.js ─────────────────────────────────────────────────────────────────
// Loaded lazily (it touches browser-only globals) and once per page load. The
// worker is bundled from pdfjs-dist so no CDN or public/ copy is needed.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  pdfjsPromise ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
      { type: "module" }
    );
    return pdfjs;
  });
  return pdfjsPromise;
}

/** Renders one PDF page at `width` CSS px, at device resolution. Renders into
 *  an offscreen canvas and copies it over when done, so zooming never flashes
 *  a blank page. */
function PdfPageCanvas({
  doc, pageNumber, width, onAspect, onError,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  onAspect: (aspect: number) => void;
  onError: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: RenderTask | null = null;
    doc.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      onAspect(base.height / base.width);
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const offscreen = document.createElement("canvas");
      offscreen.width = Math.floor(viewport.width);
      offscreen.height = Math.floor(viewport.height);
      task = page.render({ canvas: offscreen, viewport });
      return task.promise.then(() => {
        const visible = canvasRef.current;
        if (cancelled || !visible) return;
        visible.width = offscreen.width;
        visible.height = offscreen.height;
        visible.getContext("2d")?.drawImage(offscreen, 0, 0);
      });
    }).catch((e: unknown) => {
      if (cancelled || (e instanceof Error && e.name === "RenderingCancelledException")) return;
      onError("Couldn't render this PDF page.");
    });
    return () => { cancelled = true; task?.cancel(); };
    // onAspect/onError are stable setters from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNumber, width]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={`Page ${pageNumber}`} />;
}

// ─── docx-preview ───────────────────────────────────────────────────────────
/**
 * Renders a .docx with docx-preview. Paragraph highlights are keyed by the
 * paragraph's index among the document body's <w:p> elements, which is the
 * order docx-preview emits <p> elements in — so highlights saved by the
 * previous hand-rolled parser still land on the same paragraph. Page breaking
 * is off because it can split one source paragraph into two <p> elements,
 * which would shift every later index.
 */
function DocxPreviewSurface({
  buffer, annotations, tool, onCreateHighlight, onSelect, onError,
}: {
  buffer: ArrayBuffer;
  annotations: Annotation[];
  tool: Tool;
  onCreateHighlight: (paragraphIndex: number) => void;
  onSelect: (annotation: Annotation) => void;
  onError: (message: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paragraphsRef = useRef<HTMLElement[]>([]);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    host.replaceChildren();
    setRendered(false);
    import("docx-preview")
      .then(({ renderAsync }) =>
        renderAsync(buffer, host, undefined, {
          inWrapper: true,
          breakPages: false,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: false,
          renderFooters: false,
          renderFootnotes: false,
          renderEndnotes: false,
          renderComments: false,
          useBase64URL: true,
        })
      )
      .then(() => {
        if (cancelled) return;
        paragraphsRef.current = Array.from(host.querySelectorAll<HTMLElement>("section.docx p"));
        setRendered(true);
      })
      .catch(() => { if (!cancelled) onError("Couldn't render this document."); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer]);

  const highlightByParagraph = useMemo(() => {
    const map = new Map<number, Annotation>();
    for (const a of annotations) if (a.kind === "highlight" && a.paragraphIndex !== null) map.set(a.paragraphIndex, a);
    return map;
  }, [annotations]);

  // Paint highlights onto docx-preview's own DOM (it isn't React-managed).
  useEffect(() => {
    paragraphsRef.current.forEach((el, i) => {
      const h = highlightByParagraph.get(i);
      el.style.backgroundColor = h ? `${h.color}55` : "";
      el.style.cursor = h ? "pointer" : "";
      // Lets the eraser sweep find this paragraph's highlight.
      if (h?.mine) el.dataset.eraseId = String(h.id);
      else delete el.dataset.eraseId;
    });
  }, [highlightByParagraph, rendered]);

  function handleClick(e: React.MouseEvent) {
    const p = (e.target as Element).closest("p");
    const index = p ? paragraphsRef.current.indexOf(p as HTMLElement) : -1;
    if (index < 0) return;
    // An existing highlight is always clickable (to view/remove it); creating
    // a new one on a plain paragraph requires the highlight tool.
    const existing = highlightByParagraph.get(index);
    if (tool === "erase") return; // handled by the viewer's eraser sweep
    if (existing) onSelect(existing);
    else if (tool === "highlight") onCreateHighlight(index);
  }

  return (
    <div
      ref={hostRef}
      onClick={handleClick}
      className={cn(
        "min-h-[600px] [&_.docx-wrapper]:bg-transparent [&_.docx-wrapper]:p-0",
        "[&_section.docx]:shadow-sm",
        tool === "highlight" && "[&_section.docx_p:hover]:cursor-pointer [&_section.docx_p:hover]:rounded [&_section.docx_p:hover]:outline [&_section.docx_p:hover]:outline-2 [&_section.docx_p:hover]:outline-primary/30",
        tool === "erase" && "[&_p[data-erase-id]:hover]:opacity-40"
      )}
    />
  );
}

// ─── Zoom (docx only — PDFs re-render at the target size instead) ─────────────
/** Reserves layout space at the natural (unscaled) content size × zoom, so
 *  the scroll container sizes correctly, while painting the content itself
 *  scaled via CSS transform. ResizeObserver reports the pre-transform box. */
function ZoomWrapper({ zoom, overlay, children }: { zoom: number; overlay?: ReactNode; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: PAGE_WIDTH, height: PAGE_WIDTH * LETTER_ASPECT });

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative" style={{ width: size.width * zoom, height: size.height * zoom }}>
      <div ref={innerRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: "max-content" }}>
        {children}
      </div>
      {overlay}
    </div>
  );
}

// ─── Annotation overlay ─────────────────────────────────────────────────────
/** Saved markup. Memoized so an in-progress stroke never re-renders it. */
const SavedAnnotations = memo(function SavedAnnotations({
  annotations, erasing, onSelect,
}: {
  annotations: Annotation[];
  erasing: boolean;
  onSelect: (annotation: Annotation) => void;
}) {
  const parsed = useMemo(
    () => annotations.map((a) => ({ a, pts: a.kind === "comment" ? [] : parseStrokePoints(a.strokePoints) })),
    [annotations]
  );
  return (
    <>
      {parsed.map(({ a, pts }) => {
        const canErase = erasing && a.mine;
        // While erasing, the viewer's sweep hit-tests for data-erase-id; no
        // per-item handlers (clicking shouldn't open the popover either).
        const handlers = erasing ? {} : { onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(a); } };
        const cursor = erasing ? (canErase ? "pointer" : "not-allowed") : "pointer";
        const className = canErase ? "erasable" : undefined;
        const eraseId = canErase ? a.id : undefined;

        if (a.kind === "draw") {
          if (pts.length < 2) return null;
          const points = toPolylinePoints(pts);
          return (
            <g key={a.id} className={className}>
              <polyline points={points} fill="none"
                stroke={a.color} strokeWidth={STROKE_PX} strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
              {/* Invisible, wider hit area so thin strokes are easy to click or erase. */}
              <polyline points={points} fill="none" stroke="transparent" strokeWidth={14}
                strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                data-erase-id={eraseId} style={{ pointerEvents: "stroke", cursor }} {...handlers} />
            </g>
          );
        }
        if (a.kind === "highlight") {
          const [c1, c2] = pts;
          if (!c1 || !c2) return null;
          return (
            <rect key={a.id} className={className} x={Math.min(c1.x, c2.x)} y={Math.min(c1.y, c2.y)}
              width={Math.abs(c2.x - c1.x)} height={Math.abs(c2.y - c1.y)} fill={a.color} opacity={0.35}
              data-erase-id={eraseId} style={{ pointerEvents: "auto", cursor }} {...handlers} />
          );
        }
        return (
          <circle key={a.id} className={className} cx={a.x} cy={a.y} r={1.5} fill={a.color} stroke="#1f2937" strokeWidth={0.25}
            data-erase-id={eraseId} style={{ pointerEvents: "auto", cursor }} {...handlers} />
        );
      })}
    </>
  );
});

/**
 * In-progress strokes and highlight drags are drawn by mutating two SVG
 * elements directly (batched to one update per animation frame) instead of
 * through React state, so drawing never re-renders the page or saved markup.
 */
function AnnotationOverlay({
  interactive, tool, color, annotations, onDraw, onHighlightRect, onComment, onSelect,
}: {
  interactive: boolean;
  tool: Tool;
  color: string;
  annotations: Annotation[];
  onDraw: (points: Point[]) => void;
  onHighlightRect: (corners: Point[]) => void;
  onComment: (x: number, y: number) => void;
  onSelect: (annotation: Annotation) => void;
}) {
  const erasing = tool === "erase";
  const svgRef = useRef<SVGSVGElement>(null);
  const liveLineRef = useRef<SVGPolylineElement>(null);
  const liveRectRef = useRef<SVGRectElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const pointsRef = useRef<Point[]>([]);
  const activeRef = useRef(false);
  const frameRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  function toPoint(clientX: number, clientY: number): Point {
    const rect = rectRef.current!;
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  }

  function paintLive() {
    frameRef.current = 0;
    const pts = pointsRef.current;
    if (tool === "draw") {
      liveLineRef.current?.setAttribute("points", toPolylinePoints(pts));
    } else if (tool === "highlight" && pts.length === 2) {
      const [a, b] = pts;
      const r = liveRectRef.current;
      r?.setAttribute("x", String(Math.min(a.x, b.x)));
      r?.setAttribute("y", String(Math.min(a.y, b.y)));
      r?.setAttribute("width", String(Math.abs(b.x - a.x)));
      r?.setAttribute("height", String(Math.abs(b.y - a.y)));
    }
  }
  function schedulePaint() {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(paintLive);
  }
  function clearLive() {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    liveLineRef.current?.setAttribute("points", "");
    liveRectRef.current?.setAttribute("width", "0");
    liveRectRef.current?.setAttribute("height", "0");
  }

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!interactive || e.button !== 0) return;
    // Measure once per gesture rather than on every move.
    rectRef.current = svgRef.current!.getBoundingClientRect();
    const p = toPoint(e.clientX, e.clientY);
    if (tool === "comment") { onComment(p.x, p.y); return; }
    if (tool !== "draw" && tool !== "highlight") return;
    // Keep receiving moves if the pointer leaves the page mid-stroke.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not capturable; strokes still work */ }
    activeRef.current = true;
    pointsRef.current = tool === "draw" ? [p] : [p, p];
    schedulePaint();
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!activeRef.current) return;
    if (tool === "draw") {
      // Coalesced events recover the samples the browser merged between frames.
      const samples = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
      const pts = pointsRef.current;
      for (const s of samples.length ? samples : [e.nativeEvent]) {
        const p = toPoint(s.clientX, s.clientY);
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= MIN_POINT_GAP) pts.push(p);
      }
    } else {
      pointsRef.current[1] = toPoint(e.clientX, e.clientY);
    }
    schedulePaint();
  }

  function handleUp() {
    if (!activeRef.current) return;
    activeRef.current = false;
    const pts = pointsRef.current;
    pointsRef.current = [];
    clearLive();
    if (tool === "draw" && pts.length > 1) onDraw(pts);
    if (tool === "highlight" && pts.length === 2 && (pts[0].x !== pts[1].x || pts[0].y !== pts[1].y)) onHighlightRect(pts);
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      // While erasing, the overlay itself ignores the pointer (only saved items,
      // which set their own pointer-events, respond) so docx paragraph
      // highlights underneath stay clickable too.
      className={cn("absolute inset-0 h-full w-full", erasing && "[&_.erasable:hover]:opacity-40")}
      style={{
        touchAction: interactive ? "none" : "auto",
        cursor: interactive && !erasing ? "crosshair" : "default",
        pointerEvents: interactive && !erasing ? "auto" : "none",
      }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      <SavedAnnotations annotations={annotations} erasing={erasing} onSelect={onSelect} />
      <polyline ref={liveLineRef} points="" fill="none" stroke={color} strokeWidth={STROKE_PX} strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke" />
      <rect ref={liveRectRef} x={0} y={0} width={0} height={0} fill={color} opacity={0.35} />
    </svg>
  );
}

function AnnotationPopover({
  x, y, onClose, children,
}: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="absolute z-30 w-64 rounded-xl border border-border bg-white p-3 text-sm shadow-lg"
      style={{ left: `clamp(0px, ${x}%, calc(100% - 16rem))`, top: `${y}%` }}
    >
      <div className="flex justify-end">
        <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-zinc-700"><X className="h-3.5 w-3.5" /></button>
      </div>
      {children}
    </div>
  );
}

export function DocumentMarkupViewer({ submissionId, mimeType }: { submissionId: number; mimeType: string }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<Tool>("none");
  const [color, setColor] = useState(COLORS[0]);
  const [page, setPage] = useState(1);
  const [commentDraft, setCommentDraft] = useState<Point | null>(null);
  const [commentText, setCommentText] = useState("");
  const [selected, setSelected] = useState<Annotation | null>(null);

  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageAspect, setPageAspect] = useState(LETTER_ASPECT);
  const [docxBuffer, setDocxBuffer] = useState<ArrayBuffer | null>(null);
  const [docxError, setDocxError] = useState<string | null>(null);

  const isPdf = mimeType === "application/pdf";
  const isDocx = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const fileUrl = `/api/tutor/assignment-submissions/file?submissionId=${submissionId}&inline=1`;
  const downloadUrl = `/api/tutor/assignment-submissions/file?submissionId=${submissionId}`;
  const pageCount = pdfDoc?.numPages ?? null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tutor/assignment-submissions/annotations?submissionId=${submissionId}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { annotations?: Annotation[]; error?: string };
        if (!r.ok) throw new Error(data.error || "Couldn't load existing markup.");
        if (!cancelled) setAnnotations(data.annotations ?? []);
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load existing markup."); });
    return () => { cancelled = true; };
  }, [submissionId]);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    // Held in an object so TypeScript doesn't narrow it to null in the cleanup.
    const pending: { task: PDFDocumentLoadingTask | null } = { task: null };
    setPdfDoc(null);
    setPage(1);
    Promise.all([
      loadPdfjs(),
      fetch(fileUrl).then((r) => {
        if (!r.ok) throw new Error("Couldn't download this PDF.");
        return r.arrayBuffer();
      }),
    ])
      .then(([pdfjs, data]) => {
        if (cancelled) return null;
        pending.task = pdfjs.getDocument({ data });
        return pending.task.promise;
      })
      .then((doc) => { if (doc && !cancelled) setPdfDoc(doc); })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error && e.message.startsWith("Couldn't") ? e.message : "Couldn't render this PDF.");
      });
    return () => {
      cancelled = true;
      // Destroying the loading task also releases the document and its worker resources.
      void pending.task?.destroy();
    };
    // fileUrl is derived solely from submissionId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdf, submissionId]);

  useEffect(() => {
    if (!isDocx) return;
    let cancelled = false;
    setDocxBuffer(null);
    setDocxError(null);
    fetch(fileUrl)
      .then((r) => { if (!r.ok) throw new Error("Couldn't download this document."); return r.arrayBuffer(); })
      .then((buf) => { if (!cancelled) setDocxBuffer(buf); })
      .catch((e) => { if (!cancelled) setDocxError(e instanceof Error ? e.message : "Couldn't render this document."); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocx, submissionId]);

  // ── Persistence + undo history ────────────────────────────────────────────
  // History holds this tutor's own actions in this session, newest last.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [undoing, setUndoing] = useState(false);
  /** Ids already being deleted, so a sweeping eraser fires one request each. */
  const erasingIds = useRef(new Set<number>());

  /** POSTs one annotation; strokePoints is the stored JSON string. */
  async function createAnnotation(input: {
    kind: Annotation["kind"]; page: number; paragraphIndex: number | null;
    x: number; y: number; color: string; body?: string | null; strokePoints?: string | null;
  }): Promise<Annotation | null> {
    try {
      const res = await fetch("/api/tutor/assignment-submissions/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId, kind: input.kind, page: input.page, paragraphIndex: input.paragraphIndex,
          x: input.x, y: input.y, color: input.color, body: input.body ?? undefined,
          strokePoints: input.strokePoints ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Annotation & { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error || "Couldn't save markup.");
      setAnnotations((prev) => [...prev, data]);
      return data;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't save markup.");
      return null;
    }
  }

  async function removeAnnotation(annotation: Annotation): Promise<boolean> {
    setAnnotations((current) => current.filter((a) => a.id !== annotation.id));
    try {
      const res = await fetch(`/api/tutor/assignment-submissions/annotations?id=${annotation.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete markup.");
      return true;
    } catch (e) {
      setAnnotations((current) => [...current, annotation]);
      setLoadError(e instanceof Error ? e.message : "Couldn't delete markup.");
      return false;
    }
  }

  /** New markup drawn/typed by the tutor — in the current colour, undoable. */
  async function saveAnnotation(input: {
    kind: Annotation["kind"]; page: number; paragraphIndex?: number | null;
    x: number; y: number; body?: string; strokePoints?: Point[];
  }) {
    const saved = await createAnnotation({
      ...input,
      paragraphIndex: input.paragraphIndex ?? null,
      color,
      strokePoints: input.strokePoints
        ? JSON.stringify(input.strokePoints.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })))
        : null,
    });
    if (saved) setHistory((h) => [...h, { type: "add", annotation: saved }]);
  }

  /** Eraser / trash button: delete one of the tutor's own items, undoably. */
  async function eraseAnnotation(annotation: Annotation) {
    if (!annotation.mine || erasingIds.current.has(annotation.id)) return;
    erasingIds.current.add(annotation.id);
    if (selected?.id === annotation.id) setSelected(null);
    const ok = await removeAnnotation(annotation);
    erasingIds.current.delete(annotation.id);
    if (ok) setHistory((h) => [...h, { type: "remove", annotation }]);
  }

  async function undo() {
    const entry = history[history.length - 1];
    if (!entry || undoing) return;
    setUndoing(true);
    setSelected(null);
    setCommentDraft(null);
    try {
      if (entry.type === "add") {
        if (await removeAnnotation(entry.annotation)) setHistory((h) => h.slice(0, -1));
        return;
      }
      // Restore an erased item exactly as it was (it gets a new id).
      const { annotation: a } = entry;
      const restored = await createAnnotation({
        kind: a.kind, page: a.page, paragraphIndex: a.paragraphIndex, x: a.x, y: a.y,
        color: a.color, body: a.body, strokePoints: a.strokePoints,
      });
      if (!restored) return;
      // Earlier entries may refer to the old id (e.g. "added it, then erased it").
      setHistory((h) =>
        h.slice(0, -1).map((e) => (e.annotation.id === a.id ? { ...e, annotation: restored } : e))
      );
      if (isPdf && restored.page !== page) setPage(restored.page);
    } finally {
      setUndoing(false);
    }
  }

  // ── Eraser sweep ──────────────────────────────────────────────────────────
  // Pointer events alone miss thin strokes when the pointer moves fast (it can
  // jump right over them between two events), so while the button is held we
  // hit-test every few pixels along the path for elements tagged
  // data-erase-id — overlay markup and docx paragraph highlights alike.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const eraseRef = useRef(eraseAnnotation);
  eraseRef.current = eraseAnnotation;
  const erasing = tool === "erase";
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!erasing || !surface) return;
    let last: { x: number; y: number } | null = null;

    const eraseAt = (x: number, y: number) => {
      for (const el of document.elementsFromPoint(x, y)) {
        const id = Number(el.getAttribute("data-erase-id"));
        if (!id) continue;
        const target = annotationsRef.current.find((a) => a.id === id);
        if (target) void eraseRef.current(target);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
      for (let i = 1; i <= steps; i++) eraseAt(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
      last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      last = null;
      window.removeEventListener("pointermove", onMove);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      last = { x: e.clientX, y: e.clientY };
      eraseAt(e.clientX, e.clientY);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    };
    surface.addEventListener("pointerdown", onDown);
    return () => {
      surface.removeEventListener("pointerdown", onDown);
      onUp();
      window.removeEventListener("pointerup", onUp);
    };
  }, [erasing]);

  // Ctrl/Cmd+Z undoes, unless the tutor is typing in a field.
  const undoRef = useRef(undo);
  undoRef.current = undo;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== "z") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      void undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submitComment() {
    if (!commentDraft || !commentText.trim()) return;
    void saveAnnotation({
      kind: "comment", page: isPdf ? page : 1, x: commentDraft.x, y: commentDraft.y, body: commentText.trim(),
    });
    setCommentDraft(null);
    setCommentText("");
  }

  function goToPage(next: number) {
    const max = pageCount ?? 1;
    setPage(Math.min(max, Math.max(1, Math.round(next) || 1)));
    setSelected(null);
    setCommentDraft(null);
  }

  const visibleAnnotations = useMemo(
    () => (isPdf ? annotations.filter((a) => a.page === page) : annotations),
    [annotations, isPdf, page]
  );
  const overlayAnnotations = useMemo(
    () => (isDocx ? visibleAnnotations.filter((a) => a.kind !== "highlight") : visibleAnnotations),
    [isDocx, visibleAnnotations]
  );

  const tools: { key: Tool; label: string; icon: typeof MousePointer2 }[] = [
    { key: "none", label: "Pan / select", icon: MousePointer2 },
    { key: "comment", label: "Comment", icon: MessageSquare },
    { key: "highlight", label: "Highlight", icon: Highlighter },
    { key: "draw", label: "Draw", icon: PenLine },
    { key: "erase", label: "Eraser — click or drag over your markup", icon: Eraser },
  ];

  const selectAnnotation = (a: Annotation) => { setSelected(a); setCommentDraft(null); };
  const startComment = (x: number, y: number) => { setCommentDraft({ x, y }); setCommentText(""); setSelected(null); };

  const popovers = (
    <>
      {commentDraft && (
        <AnnotationPopover x={commentDraft.x} y={commentDraft.y} onClose={() => { setCommentDraft(null); setCommentText(""); }}>
          <Textarea autoFocus value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" className="min-h-[70px] text-sm" maxLength={2000} />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={submitComment} disabled={!commentText.trim()}>Save</Button>
          </div>
        </AnnotationPopover>
      )}
      {selected && (
        <AnnotationPopover x={selected.x} y={selected.y} onClose={() => setSelected(null)}>
          <p className="text-zinc-800">
            {selected.body || (
              <span className="italic text-zinc-400">{selected.kind === "highlight" && isDocx ? "Highlighted paragraph." : "No comment text."}</span>
            )}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-zinc-400">{new Date(selected.createdAt).toLocaleString()}</p>
            {selected.mine && (
              <Button size="sm" variant="danger" onClick={() => void eraseAnnotation(selected)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </AnnotationPopover>
      )}
    </>
  );

  const pdfWidth = Math.round(PAGE_WIDTH * zoom);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-2">
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
          {tools.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tool === t.key ? "primary" : "ghost"}
              onClick={() => setTool(t.key)}
              aria-pressed={tool === t.key}
              title={t.label}
            >
              <t.icon className="h-3.5 w-3.5" />
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => void undo()}
          disabled={history.length === 0 || undoing}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          {undoing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
          Undo
        </Button>

        {tool === "erase" && <span className="text-xs text-zinc-500">Click or drag over your markup to erase it.</span>}

        {(tool === "highlight" || tool === "draw") && (
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Use color ${c}`}
                className={cn("h-6 w-6 rounded-full border-2", color === c ? "border-zinc-900" : "border-transparent")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} aria-label="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-12 text-center text-xs text-zinc-600">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))} aria-label="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.open(downloadUrl, "_blank")}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      {isPdf && (
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <Button size="sm" variant="outline" onClick={() => goToPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          Page
          <input
            type="number"
            min={1}
            max={pageCount ?? undefined}
            value={page}
            onChange={(e) => goToPage(Number(e.target.value))}
            aria-label="Page number"
            className="focus-ring h-8 w-16 rounded-lg border border-border px-2 text-center text-sm"
          />
          {pageCount !== null && <span>of {pageCount}</span>}
          <Button size="sm" variant="outline" onClick={() => goToPage(page + 1)} disabled={pageCount === null || page >= pageCount} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {loadError && <p role="alert" className="text-sm text-red-700">{loadError}</p>}

      <div
        ref={surfaceRef}
        className="overflow-auto rounded-xl border border-border bg-zinc-100 p-6"
        style={{ maxHeight: "70vh", touchAction: tool === "erase" ? "none" : undefined }}
      >
        {isPdf && (
          <div className="relative bg-white shadow-sm" style={{ width: pdfWidth, height: Math.round(pdfWidth * pageAspect) }}>
            {pdfDoc ? (
              <PdfPageCanvas doc={pdfDoc} pageNumber={page} width={pdfWidth} onAspect={setPageAspect} onError={setLoadError} />
            ) : (
              <div role="status" className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading submission…
              </div>
            )}
            <AnnotationOverlay
              interactive={tool !== "none"}
              tool={tool}
              color={color}
              annotations={visibleAnnotations}
              onDraw={(points) => void saveAnnotation({ kind: "draw", page, x: points[0].x, y: points[0].y, strokePoints: points })}
              onHighlightRect={(corners) => void saveAnnotation({ kind: "highlight", page, x: corners[0].x, y: corners[0].y, strokePoints: corners })}
              onComment={startComment}
              onSelect={selectAnnotation}
            />
            {popovers}
          </div>
        )}

        {isDocx && docxError && <p role="alert" className="text-sm text-red-700">{docxError}</p>}
        {isDocx && !docxError && !docxBuffer && (
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Rendering document…</div>
        )}
        {isDocx && docxBuffer && !docxError && (
          <ZoomWrapper zoom={zoom} overlay={popovers}>
            <div className="relative">
              <DocxPreviewSurface
                buffer={docxBuffer}
                annotations={visibleAnnotations}
                tool={tool}
                onCreateHighlight={(paragraphIndex) => void saveAnnotation({ kind: "highlight", page: 1, paragraphIndex, x: 0, y: 0 })}
                onSelect={selectAnnotation}
                onError={setDocxError}
              />
              <AnnotationOverlay
                interactive={tool === "draw" || tool === "comment" || tool === "erase"}
                tool={tool}
                color={color}
                annotations={overlayAnnotations}
                onDraw={(points) => void saveAnnotation({ kind: "draw", page: 1, x: points[0].x, y: points[0].y, strokePoints: points })}
                onHighlightRect={() => {}}
                onComment={startComment}
                onSelect={selectAnnotation}
              />
            </div>
          </ZoomWrapper>
        )}

        {!isPdf && !isDocx && <p className="text-sm text-zinc-500">This file type can&apos;t be previewed here.</p>}
      </div>
    </div>
  );
}
