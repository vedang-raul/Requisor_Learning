"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Download, Highlighter, Loader2, MessageSquare,
  MousePointer2, PenLine, Trash2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseDocx, type DocxParagraph } from "@/lib/docx-parser";

/**
 * A tutor's markup surface for one submission: comments, highlights, and
 * freehand drawing over a PDF or docx, plus zoom. There's no PDF.js or docx-
 * rendering library in this project (see lib/docx-parser.ts for why) — PDFs
 * use the browser's own built-in viewer in an <iframe>, docx is rendered from
 * scratch to HTML. Both get the same annotation overlay on top.
 *
 * Every annotation position is stored as a percentage (0-100) of the
 * unscaled content box, not pixels — so it stays aligned at any zoom level,
 * and CSS transform:scale() is the only zoom mechanism (see ZoomWrapper),
 * rather than re-rendering content at a different size.
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

type Tool = "none" | "comment" | "highlight" | "draw";
type Point = { x: number; y: number };

const COLORS = ["#facc15", "#f87171", "#4ade80", "#60a5fa", "#c084fc", "#fb923c"];
const PAGE_WIDTH = 800;
const PDF_PAGE_HEIGHT = 1035; // ~ Letter aspect ratio at PAGE_WIDTH

function parseStrokePoints(raw: string | null): Point[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p?.x === "number" && typeof p?.y === "number") : [];
  } catch {
    return [];
  }
}

/** Reserves layout space at the natural (unscaled) content size × zoom, so
 *  the scroll container sizes correctly, while painting the content itself
 *  scaled via CSS transform. ResizeObserver reports the pre-transform box. */
function ZoomWrapper({ zoom, overlay, children }: { zoom: number; overlay?: ReactNode; children: ReactNode }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: PAGE_WIDTH, height: PDF_PAGE_HEIGHT });

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
      <div ref={innerRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: PAGE_WIDTH }}>
        {children}
      </div>
      {overlay}
    </div>
  );
}

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
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);

  function pointFromEvent(e: React.PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function handleDown(e: React.PointerEvent) {
    if (!interactive) return;
    const p = pointFromEvent(e);
    if (tool === "draw") setDrawing([p]);
    else if (tool === "highlight") { setDragStart(p); setDragCurrent(p); }
    else if (tool === "comment") onComment(p.x, p.y);
  }
  function handleMove(e: React.PointerEvent) {
    if (tool === "draw" && drawing) setDrawing((prev) => (prev ? [...prev, pointFromEvent(e)] : prev));
    else if (tool === "highlight" && dragStart) setDragCurrent(pointFromEvent(e));
  }
  function handleUp() {
    if (tool === "draw" && drawing && drawing.length > 1) onDraw(drawing);
    if (tool === "highlight" && dragStart && dragCurrent) onHighlightRect([dragStart, dragCurrent]);
    setDrawing(null); setDragStart(null); setDragCurrent(null);
  }

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      style={{ touchAction: "none", cursor: interactive ? "crosshair" : "default", pointerEvents: interactive ? "auto" : "none" }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
    >
      {annotations.map((a) => {
        if (a.kind === "draw") {
          const pts = parseStrokePoints(a.strokePoints);
          if (pts.length < 2) return null;
          return (
            <polyline key={a.id} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
              stroke={a.color} strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round"
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={(e) => { e.stopPropagation(); onSelect(a); }} />
          );
        }
        if (a.kind === "highlight") {
          const [c1, c2] = parseStrokePoints(a.strokePoints);
          if (!c1 || !c2) return null;
          const x = Math.min(c1.x, c2.x), y = Math.min(c1.y, c2.y);
          const w = Math.abs(c2.x - c1.x), h = Math.abs(c2.y - c1.y);
          return (
            <rect key={a.id} x={x} y={y} width={w} height={h} fill={a.color} opacity={0.35}
              style={{ pointerEvents: "auto", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onSelect(a); }} />
          );
        }
        return (
          <circle key={a.id} cx={a.x} cy={a.y} r={1.5} fill={a.color} stroke="#1f2937" strokeWidth={0.25}
            style={{ pointerEvents: "auto", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onSelect(a); }} />
        );
      })}
      {drawing && drawing.length > 1 && (
        <polyline points={drawing.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {dragStart && dragCurrent && (
        <rect x={Math.min(dragStart.x, dragCurrent.x)} y={Math.min(dragStart.y, dragCurrent.y)}
          width={Math.abs(dragCurrent.x - dragStart.x)} height={Math.abs(dragCurrent.y - dragStart.y)}
          fill={color} opacity={0.35} />
      )}
    </svg>
  );
}

function runStyle(run: DocxParagraph["runs"][number]): React.CSSProperties {
  return {
    fontWeight: run.bold ? 700 : 400,
    fontStyle: run.italic ? "italic" : "normal",
    textDecoration: run.underline ? "underline" : "none",
    whiteSpace: "pre-wrap",
  };
}

function DocxSurface({
  paragraphs, annotations, tool, color, onCreateHighlight, onSelect,
}: {
  paragraphs: DocxParagraph[];
  annotations: Annotation[];
  tool: Tool;
  color: string;
  onCreateHighlight: (paragraphIndex: number) => void;
  onSelect: (annotation: Annotation) => void;
}) {
  const highlightByParagraph = useMemo(() => {
    const map = new Map<number, Annotation>();
    for (const a of annotations) if (a.kind === "highlight" && a.paragraphIndex !== null) map.set(a.paragraphIndex, a);
    return map;
  }, [annotations]);

  return (
    <div className="min-h-[600px] rounded-sm bg-white p-10 shadow-sm" style={{ width: PAGE_WIDTH, fontFamily: "Georgia, 'Times New Roman', serif" }}>
      {paragraphs.length === 0 && <p className="text-sm italic text-zinc-400">This document has no readable text.</p>}
      {paragraphs.map((p, i) => {
        const highlight = highlightByParagraph.get(i);
        const isHeading = p.heading !== null;
        return (
          <p
            key={i}
            onClick={() => {
              // An existing highlight is always clickable (to view/remove it),
              // regardless of the active tool — matches how PDF annotations
              // stay clickable outside their creating tool. Only creating a
              // *new* highlight on a plain paragraph requires the tool active.
              if (highlight) { onSelect(highlight); return; }
              if (tool === "highlight") onCreateHighlight(i);
            }}
            className={cn(
              "mb-3 text-[15px] leading-relaxed text-zinc-900",
              (tool === "highlight" || highlight) && "cursor-pointer rounded hover:outline hover:outline-2 hover:outline-primary/30",
              isHeading && "font-bold",
              p.heading === 1 && "text-2xl",
              p.heading === 2 && "text-xl",
              p.heading === 3 && "text-lg"
            )}
            style={{ backgroundColor: highlight ? `${highlight.color}55` : undefined }}
          >
            {p.runs.length === 0 ? " " : p.runs.map((run, j) => <span key={j} style={runStyle(run)}>{run.text}</span>)}
          </p>
        );
      })}
    </div>
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

  const [docxParagraphs, setDocxParagraphs] = useState<DocxParagraph[] | null>(null);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  const isPdf = mimeType === "application/pdf";
  const isDocx = mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const fileUrl = `/api/tutor/assignment-submissions/file?submissionId=${submissionId}&inline=1`;
  const downloadUrl = `/api/tutor/assignment-submissions/file?submissionId=${submissionId}`;

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
    let objectUrl: string | null = null;
    setPdfBlobUrl(null);
    fetch(fileUrl)
      .then((r) => {
        if (!r.ok) throw new Error("Couldn't download this PDF.");
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(objectUrl);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't render this PDF.");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // fileUrl is derived solely from submissionId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdf, submissionId]);

  useEffect(() => {
    if (!isDocx) return;
    let cancelled = false;
    fetch(fileUrl)
      .then((r) => { if (!r.ok) throw new Error("Couldn't download this document."); return r.arrayBuffer(); })
      .then((buf) => parseDocx(buf))
      .then((paragraphs) => { if (!cancelled) setDocxParagraphs(paragraphs); })
      .catch((e) => { if (!cancelled) setDocxError(e instanceof Error ? e.message : "Couldn't render this document."); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocx, submissionId]);

  async function saveAnnotation(input: {
    kind: Annotation["kind"]; page: number; paragraphIndex?: number | null;
    x: number; y: number; body?: string; strokePoints?: Point[];
  }) {
    try {
      const res = await fetch("/api/tutor/assignment-submissions/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId, kind: input.kind, page: input.page, paragraphIndex: input.paragraphIndex ?? null,
          x: input.x, y: input.y, color, body: input.body,
          strokePoints: input.strokePoints ? JSON.stringify(input.strokePoints) : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Annotation & { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error || "Couldn't save markup.");
      setAnnotations((prev) => [...prev, data]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't save markup.");
    }
  }

  async function deleteAnnotation(id: number) {
    const prev = annotations;
    setAnnotations((current) => current.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/tutor/assignment-submissions/annotations?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete markup.");
    } catch (e) {
      setAnnotations(prev);
      setLoadError(e instanceof Error ? e.message : "Couldn't delete markup.");
    }
  }

  function submitComment() {
    if (!commentDraft || !commentText.trim()) return;
    void saveAnnotation({
      kind: "comment", page: isPdf ? page : 1, x: commentDraft.x, y: commentDraft.y, body: commentText.trim(),
    });
    setCommentDraft(null);
    setCommentText("");
  }

  const visibleAnnotations = isPdf ? annotations.filter((a) => a.page === page) : annotations;

  const tools: { key: Tool; label: string; icon: typeof MousePointer2 }[] = [
    { key: "none", label: "Pan / select", icon: MousePointer2 },
    { key: "comment", label: "Comment", icon: MessageSquare },
    { key: "highlight", label: "Highlight", icon: Highlighter },
    { key: "draw", label: "Draw", icon: PenLine },
  ];

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

        {(tool === "highlight" || tool === "draw" || tool === "comment") && (
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
          <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          Page
          <input
            type="number"
            min={1}
            value={page}
            onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
            className="focus-ring h-8 w-16 rounded-lg border border-border px-2 text-center text-sm"
          />
          <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
          <span className="text-xs text-zinc-400">(this app has no PDF page-count reader — type any page number)</span>
        </div>
      )}

      {loadError && <p role="alert" className="text-sm text-red-700">{loadError}</p>}

      <div className="overflow-auto rounded-xl border border-border bg-zinc-100 p-6" style={{ maxHeight: "70vh" }}>
        {isPdf && (
          <ZoomWrapper
            zoom={zoom}
            overlay={
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
                    <p className="text-zinc-800">{selected.body || <span className="italic text-zinc-400">No comment text.</span>}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-zinc-400">{new Date(selected.createdAt).toLocaleString()}</p>
                      {selected.mine && (
                        <Button size="sm" variant="danger" onClick={() => { void deleteAnnotation(selected.id); setSelected(null); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </AnnotationPopover>
                )}
              </>
            }
          >
            <div className="relative bg-white shadow-sm" style={{ width: PAGE_WIDTH, height: PDF_PAGE_HEIGHT }}>
              {pdfBlobUrl ? (
                <iframe src={`${pdfBlobUrl}#page=${page}&toolbar=0&navpanes=0`} title="Submission PDF" className="absolute inset-0 h-full w-full border-0" />
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
                onComment={(x, y) => { setCommentDraft({ x, y }); setCommentText(""); setSelected(null); }}
                onSelect={(a) => { setSelected(a); setCommentDraft(null); }}
              />
            </div>
          </ZoomWrapper>
        )}

        {isDocx && docxError && <p role="alert" className="text-sm text-red-700">{docxError}</p>}
        {isDocx && !docxError && !docxParagraphs && (
          <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Rendering document…</div>
        )}
        {isDocx && docxParagraphs && (
          <ZoomWrapper
            zoom={zoom}
            overlay={
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
                    <p className="text-zinc-800">{selected.body || <span className="italic text-zinc-400">Highlighted paragraph.</span>}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-zinc-400">{new Date(selected.createdAt).toLocaleString()}</p>
                      {selected.mine && (
                        <Button size="sm" variant="danger" onClick={() => { void deleteAnnotation(selected.id); setSelected(null); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </AnnotationPopover>
                )}
              </>
            }
          >
            <div className="relative">
              <DocxSurface
                paragraphs={docxParagraphs}
                annotations={visibleAnnotations}
                tool={tool}
                color={color}
                onCreateHighlight={(paragraphIndex) => void saveAnnotation({ kind: "highlight", page: 1, paragraphIndex, x: 0, y: 0 })}
                onSelect={(a) => { setSelected(a); setCommentDraft(null); }}
              />
              <AnnotationOverlay
                interactive={tool === "draw" || tool === "comment"}
                tool={tool}
                color={color}
                annotations={visibleAnnotations.filter((a) => a.kind !== "highlight")}
                onDraw={(points) => void saveAnnotation({ kind: "draw", page: 1, x: points[0].x, y: points[0].y, strokePoints: points })}
                onHighlightRect={() => {}}
                onComment={(x, y) => { setCommentDraft({ x, y }); setCommentText(""); setSelected(null); }}
                onSelect={(a) => { setSelected(a); setCommentDraft(null); }}
              />
            </div>
          </ZoomWrapper>
        )}

        {!isPdf && !isDocx && <p className="text-sm text-zinc-500">This file type can&apos;t be previewed here.</p>}
      </div>
    </div>
  );
}
