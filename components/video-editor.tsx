"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Download, Loader2, Pause, Play, Wand2, X } from "lucide-react";
import { parseVtt } from "@/lib/video-edit";
import { editTimeOf, findPauses, keptSegments, totalSeconds, type Span } from "@/lib/video-editing";
import { cn } from "@/lib/utils";

/**
 * A basic editor for a lesson recording, entirely in the browser: trim the
 * ends, cut pauses, add a title card, name strap and closing line in one of
 * three looks, and optionally burn in captions. Nothing is uploaded.
 *
 * The edit is "rendered" by playing it once onto a canvas and recording that
 * (there is no faster way in a browser), so export takes as long as the edited
 * video runs.
 */

type Template = "clean" | "bold" | "minimal";
const TEMPLATES: Record<Template, { label: string; accent: string; card: string; weight: number; upper: boolean }> = {
  clean: { label: "Clean", accent: "#23AE97", card: "rgba(7, 31, 28, 0.84)", weight: 600, upper: false },
  bold: { label: "Bold", accent: "#FF9E5E", card: "rgba(24, 24, 27, 0.92)", weight: 800, upper: true },
  minimal: { label: "Minimal", accent: "#FFFFFF", card: "rgba(0, 0, 0, 0.55)", weight: 500, upper: false },
};

const TITLE_SECONDS = 3;
const STRAP_SECONDS = 6;
const CTA_SECONDS = 3.5;
/** Pause detection reads the whole file into memory; past this size it is skipped. */
const MAX_ANALYSE_BYTES = 600 * 1024 * 1024;
const MIME_CANDIDATES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Loudness of the recording in 50 ms steps, from a low-rate mono decode of its audio. */
async function loudnessEnvelope(source: File | string): Promise<{ envelope: Float32Array; step: number }> {
  const bytes = source instanceof File ? await source.arrayBuffer() : await (await fetch(source)).arrayBuffer();
  if (bytes.byteLength > MAX_ANALYSE_BYTES) throw new Error("too-large");
  const rate = 8000;
  const audio = await new OfflineAudioContext(1, 1, rate).decodeAudioData(bytes);
  const samples = audio.getChannelData(0);
  const size = rate / 20;
  const envelope = new Float32Array(Math.ceil(samples.length / size));
  for (let i = 0; i < envelope.length; i++) {
    let sum = 0;
    const end = Math.min(samples.length, (i + 1) * size);
    for (let j = i * size; j < end; j++) sum += samples[j] * samples[j];
    envelope[i] = Math.sqrt(sum / Math.max(1, end - i * size));
  }
  return { envelope, step: size / rate };
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

export type EditorSource = {
  /** A recording still in the browser, or… */
  file?: File;
  /** …a same-origin URL that can be played and seeked (the tidied-up video). */
  url?: string;
  /** Captions timed to this video (WebVTT), if there are any. */
  vtt?: string;
  /** Used to name the exported file and pre-fill the title card. */
  title: string;
};

export function VideoEditor({ source, onClose }: { source: EditorSource; onClose: () => void }) {
  const { data: session } = useSession();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [removePauses, setRemovePauses] = useState(false);
  const [sensitivity, setSensitivity] = useState(0.35);
  const [analysis, setAnalysis] = useState<{ envelope: Float32Array; step: number } | null>(null);
  const [analysing, setAnalysing] = useState<"idle" | "working" | "failed" | "too-large">("idle");
  const [template, setTemplate] = useState<Template>("clean");
  const [titleCard, setTitleCard] = useState("");
  const [subline, setSubline] = useState("");
  const [nameStrap, setNameStrap] = useState("");
  const [cta, setCta] = useState("");
  // Captions come with a tidied-up video, or from a subtitle file the tutor adds here.
  const [cues, setCues] = useState(() => (source.vtt ? parseVtt(source.vtt) : []));
  const [burnCaptions, setBurnCaptions] = useState(cues.length > 0);
  const [captionNote, setCaptionNote] = useState<string | null>(null);

  async function loadCaptions(file: File | undefined) {
    if (!file) return;
    const parsed = parseVtt(await file.text());
    if (!parsed.length) { setCaptionNote("That file has no captions in it. Use a .vtt or .srt subtitle file."); return; }
    setCues(parsed);
    setBurnCaptions(true);
    setCaptionNote(`${parsed.length} caption line${parsed.length === 1 ? "" : "s"} loaded from ${file.name}.`);
  }

  const [mode, setMode] = useState<"idle" | "edit" | "raw" | "export">("idle");
  const [position, setPosition] = useState(0); // source time, for the timeline
  const [exported, setExported] = useState<{ url: string; name: string; size: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // ── source ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (source.file) {
      const url = URL.createObjectURL(source.file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    setSrc(source.url ?? null);
  }, [source.file, source.url]);
  useEffect(() => () => { if (exported) URL.revokeObjectURL(exported.url); }, [exported]);

  function onMetadata() {
    const video = videoRef.current;
    if (!video) return;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setDuration(video.duration);
      setTrimEnd((end) => end || video.duration);
      return;
    }
    // Browser recordings (WebM) don't store their length; seeking far past the end makes the browser work it out.
    const settle = () => {
      if (!Number.isFinite(video.duration)) return;
      video.removeEventListener("durationchange", settle);
      setDuration(video.duration);
      setTrimEnd((end) => end || video.duration);
      video.currentTime = 0;
    };
    video.addEventListener("durationchange", settle);
    video.currentTime = 1e9;
  }

  // ── the edit ──────────────────────────────────────────────────────────
  const pauses = useMemo<Span[]>(
    () => (removePauses && analysis ? findPauses(analysis.envelope, analysis.step, sensitivity) : []),
    [removePauses, analysis, sensitivity]
  );
  const segments = useMemo(() => keptSegments(trimStart, Math.max(trimStart, trimEnd), pauses), [trimStart, trimEnd, pauses]);
  const editSeconds = totalSeconds(segments);

  async function analyse() {
    if (analysis || analysing === "working") return;
    setAnalysing("working");
    try {
      setAnalysis(await loudnessEnvelope(source.file ?? source.url!));
      setAnalysing("idle");
    } catch (error) {
      setAnalysing(error instanceof Error && error.message === "too-large" ? "too-large" : "failed");
      setRemovePauses(false);
    }
  }
  function togglePauses(on: boolean) {
    setRemovePauses(on);
    if (on) void analyse();
  }

  function autoEdit() {
    togglePauses(true);
    if (!titleCard) setTitleCard(source.title);
    if (!nameStrap && session?.user?.name) setNameStrap(session.user.name);
    if (!cta) setCta("See you in the next lesson");
  }

  // Everything the frame painter needs, readable from timers without re-subscribing.
  const live = useRef({ segments, editSeconds, template, titleCard, subline, nameStrap, cta, burnCaptions, cues, mode });
  live.current = { segments, editSeconds, template, titleCard, subline, nameStrap, cta, burnCaptions, cues, mode };

  /** Paints the current video frame, plus the on-screen text when showing the edit. */
  function paint() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    const scale = Math.min(1, 1280 / video.videoWidth);
    const w = Math.round((video.videoWidth * scale) / 2) * 2, h = Math.round((video.videoHeight * scale) / 2) * 2;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const state = live.current;
    if (state.mode === "raw") return;

    const look = TEMPLATES[state.template];
    const t = editTimeOf(state.segments, video.currentTime) ?? 0;
    const font = (size: number, weight = look.weight) => `${weight} ${Math.round(size)}px "Instrument Sans", Inter, system-ui, sans-serif`;
    const say = (text: string) => (look.upper ? text.toUpperCase() : text);
    const fade = (from: number, to: number, edge = 0.4) => Math.max(0, Math.min(1, (t - from) / edge, (to - t) / edge));
    ctx.textBaseline = "middle";

    const hasTitle = Boolean(state.titleCard.trim());
    if (hasTitle && t < TITLE_SECONDS) {
      ctx.globalAlpha = Math.min(1, (TITLE_SECONDS - t) / 0.5);
      ctx.fillStyle = look.card;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(h * 0.085);
      const lines = wrapLines(ctx, say(state.titleCard.trim()), w * 0.8, 3);
      const lineHeight = h * 0.1;
      const top = h / 2 - ((lines.length - 1) * lineHeight) / 2 - (state.subline.trim() ? h * 0.04 : 0);
      lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lineHeight));
      ctx.fillStyle = look.accent;
      ctx.fillRect(w / 2 - w * 0.04, top + lines.length * lineHeight - lineHeight * 0.35, w * 0.08, Math.max(3, h * 0.006));
      if (state.subline.trim()) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
        ctx.font = font(h * 0.04, 500);
        ctx.fillText(state.subline.trim(), w / 2, top + lines.length * lineHeight + h * 0.035);
      }
      ctx.globalAlpha = 1;
    }

    const strapFrom = hasTitle ? TITLE_SECONDS + 0.4 : 0.6;
    const ctaFrom = state.editSeconds - CTA_SECONDS;
    const closing = Boolean(state.cta.trim()) && state.editSeconds > CTA_SECONDS + 1 && t >= ctaFrom;
    if (state.nameStrap.trim() && !closing && t >= strapFrom && t < strapFrom + STRAP_SECONDS) {
      ctx.globalAlpha = fade(strapFrom, strapFrom + STRAP_SECONDS);
      ctx.font = font(h * 0.04);
      ctx.textAlign = "left";
      const text = say(state.nameStrap.trim());
      const padX = h * 0.03, boxH = h * 0.085, x = w * 0.04, y = h * 0.8;
      const boxW = Math.min(w * 0.8, ctx.measureText(text).width + padX * 2 + h * 0.012);
      ctx.fillStyle = look.card;
      ctx.fillRect(x, y, boxW, boxH);
      ctx.fillStyle = look.accent;
      ctx.fillRect(x, y, h * 0.012, boxH);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(text, x + padX + h * 0.012, y + boxH / 2, boxW - padX * 2);
      ctx.globalAlpha = 1;
    }

    if (closing) {
      ctx.globalAlpha = Math.min(1, (t - ctaFrom) / 0.5);
      ctx.fillStyle = look.card;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = font(h * 0.07);
      const lines = wrapLines(ctx, say(state.cta.trim()), w * 0.8, 3);
      lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * h * 0.085));
      ctx.globalAlpha = 1;
    } else if (state.burnCaptions && state.cues.length && !(hasTitle && t < TITLE_SECONDS)) {
      const cue = state.cues.find((c) => video.currentTime >= c.start && video.currentTime <= c.end);
      if (cue) {
        ctx.font = font(h * 0.042, 600);
        ctx.textAlign = "center";
        const lines = wrapLines(ctx, cue.text, w * 0.84, 2);
        const lineHeight = h * 0.056;
        const boxW = Math.max(...lines.map((line) => ctx.measureText(line).width)) + h * 0.05;
        const boxH = lines.length * lineHeight + h * 0.02;
        const y = h * 0.94 - boxH;
        ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
        ctx.fillRect(w / 2 - boxW / 2, y, boxW, boxH);
        ctx.fillStyle = "#FFFFFF";
        lines.forEach((line, i) => ctx.fillText(line, w / 2, y + h * 0.01 + lineHeight * (i + 0.5)));
      }
    }
  }

  // ── playback / export engine ──────────────────────────────────────────
  const engine = useRef<{ stop: () => void } | null>(null);
  const audioGraph = useRef<{ context: AudioContext; node: MediaElementAudioSourceNode; out: MediaStreamAudioDestinationNode } | null>(null);

  function stop() {
    engine.current?.stop();
    engine.current = null;
    videoRef.current?.pause();
    setMode("idle");
  }
  useEffect(() => () => { engine.current?.stop(); void audioGraph.current?.context.close(); }, []);
  // Repaint the still frame when a setting changes while paused.
  useEffect(() => { if (mode === "idle") paint(); });

  /** Plays the kept segments in order, calling onDone at the end. Frames are driven by a worker so a hidden tab doesn't stall an export. */
  function run(kind: "edit" | "raw" | "export", recorder: MediaRecorder | null, onDone: () => void) {
    const video = videoRef.current;
    if (!video) return;
    engine.current?.stop();
    const plan: Span[] = kind === "raw" ? [{ start: 0, end: duration }] : segments;
    if (!plan.length) return;
    let index = 0, seeking = false, finished = false;
    let worker: Worker | null = null, timer = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
      worker?.terminate();
      window.clearInterval(timer);
      video.pause();
      onDone();
    };
    const jump = (to: number) => {
      seeking = true;
      if (recorder?.state === "recording") recorder.pause(); // keep the seek out of the export
      const resume = () => {
        video.removeEventListener("seeked", resume);
        seeking = false;
        if (recorder?.state === "paused") recorder.resume();
        void video.play().catch(() => finish());
      };
      video.addEventListener("seeked", resume);
      video.currentTime = to;
    };
    const tick = () => {
      if (finished) return;
      paint();
      setPosition(video.currentTime);
      if (seeking) return;
      if (video.currentTime >= plan[index].end - 0.04 || video.ended) {
        index += 1;
        if (index >= plan.length) finish(); else jump(plan[index].start);
      }
    };
    try { worker = new Worker("/record-tick.js"); worker.onmessage = tick; } catch { timer = window.setInterval(tick, 1000 / 30); }
    engine.current = { stop: () => { finished = true; worker?.terminate(); window.clearInterval(timer); if (recorder && recorder.state !== "inactive") recorder.stop(); } };
    setMode(kind);
    live.current.mode = kind;
    jump(plan[0].start);
  }

  function exportEdit() {
    const video = videoRef.current, canvas = canvasRef.current;
    if (!video || !canvas || !segments.length) return;
    setExportError(null);
    setExported(null);
    try {
      // The video's sound is routed through Web Audio so it can be recorded and still heard.
      if (!audioGraph.current) {
        const context = new AudioContext();
        const node = context.createMediaElementSource(video);
        const out = context.createMediaStreamDestination();
        node.connect(context.destination);
        node.connect(out);
        audioGraph.current = { context, node, out };
      }
      void audioGraph.current.context.resume();
      paint();
      const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioGraph.current.out.stream.getAudioTracks()]);
      const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
      const chunks: Blob[] = [];
      let completed = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        setMode("idle");
        if (!completed) return; // cancelled part-way
        const type = (recorder.mimeType || mimeType || "video/webm").split(";")[0];
        const blob = new Blob(chunks, { type });
        const name = `${source.title.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lesson"}-edited.${type === "video/mp4" ? "mp4" : "webm"}`;
        setExported({ url: URL.createObjectURL(blob), name, size: blob.size });
      };
      recorder.start(1000);
      run("export", recorder, () => { completed = true; if (recorder.state !== "inactive") recorder.stop(); });
    } catch {
      setExportError("This browser couldn't export the video. Try the latest Chrome or Edge.");
      setMode("idle");
    }
  }

  const busy = mode !== "idle";
  const progress = mode === "raw" ? position / Math.max(duration, 0.01) : (editTimeOf(segments, position) ?? 0) / Math.max(editSeconds, 0.01);
  const field = "mt-1 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none";
  const range = "mt-1 block w-full accent-primary";

  return (
    <div role="dialog" aria-label="Edit your video" className="fixed inset-0 z-[100] overflow-y-auto bg-background text-zinc-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Edit your video <span className="text-sm font-normal text-zinc-500">· {source.title || "Lesson"}</span></h1>
          <button type="button" onClick={() => { stop(); onClose(); }} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-zinc-100"><X className="h-4 w-4" />Close</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* preview + export */}
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-border bg-white p-3 shadow-sm">
              <canvas ref={canvasRef} className="mx-auto block max-h-[62vh] w-full rounded-lg bg-black object-contain" />
              {src && <video ref={videoRef} src={src} playsInline preload="auto" onLoadedMetadata={onMetadata} onLoadedData={paint} onSeeked={paint} onError={() => setLoadError("This video couldn't be opened for editing.")} className="pointer-events-none absolute h-px w-px opacity-0" />}
            </div>
            {loadError && <p role="alert" className="text-sm text-red-700">{loadError}</p>}

            {/* timeline: what is kept (teal) and cut (dark), and where playback is */}
            <div className="relative h-7 overflow-hidden rounded-lg border border-border bg-zinc-200" aria-label={`Edited length ${clock(editSeconds)} of ${clock(duration)}`}>
              {duration > 0 && segments.map((segment, i) => (
                <span key={i} className="absolute inset-y-0 bg-primary/70" style={{ left: `${(segment.start / duration) * 100}%`, width: `${((segment.end - segment.start) / duration) * 100}%` }} />
              ))}
              {duration > 0 && <span className="absolute inset-y-0 w-0.5 bg-zinc-900" style={{ left: `${(position / duration) * 100}%` }} />}
            </div>
            <p className="text-xs text-zinc-500">
              Edit runs {clock(editSeconds)} of the original {clock(duration)}
              {removePauses && analysis ? ` · ${pauses.length} pause${pauses.length === 1 ? "" : "s"} cut` : ""}
            </p>

            <div className="flex flex-wrap gap-2">
              {mode === "edit" || mode === "raw" ? (
                <button type="button" onClick={stop} className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white"><Pause className="h-4 w-4" />Stop</button>
              ) : (
                <>
                  <button type="button" disabled={busy || !duration} onClick={() => run("edit", null, () => setMode("idle"))} className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"><Play className="h-4 w-4" />Play the edit</button>
                  <button type="button" disabled={busy || !duration} onClick={() => run("raw", null, () => setMode("idle"))} className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50">Play raw take</button>
                </>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">Export</h2>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mode === "export" ? Math.round(progress * 100) : 0}>
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: mode === "export" ? `${Math.min(100, progress * 100)}%` : exported ? "100%" : "0%" }} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mode === "export" ? (
                  <button type="button" onClick={stop} className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-zinc-100"><Loader2 className="h-4 w-4 animate-spin" />Exporting… cancel</button>
                ) : (
                  <button type="button" disabled={busy || !segments.length} onClick={exportEdit} className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50">Export edited video</button>
                )}
                {exported && (
                  <a href={exported.url} download={exported.name} className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white"><Download className="h-4 w-4" />Download ({Math.max(1, Math.round(exported.size / 1024 / 1024))} MB)</a>
                )}
                {src && <a href={source.file ? src : (source.url ?? "").replace(/\?inline=1$/, "")} download={source.file?.name} className="focus-ring inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-zinc-100">Save raw take</a>}
              </div>
              {exportError && <p role="alert" className="text-sm text-red-700">{exportError}</p>}
              <p className="text-xs leading-relaxed text-zinc-500">
                Export plays the edit once in real time to render it, so a 2-minute video takes about 2 minutes. Keep this tab open while it runs. Then upload the downloaded file to YouTube and paste its link into the lesson.
              </p>
            </div>
          </div>

          {/* controls */}
          <div className="space-y-5 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <div className="space-y-2">
              <h2 className="text-base font-semibold">Edit</h2>
              <button type="button" disabled={busy} onClick={autoEdit} className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50"><Wand2 className="h-4 w-4" />Auto-edit this take</button>
              <p className="rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-zinc-600">Auto-edit cuts pauses and fills in a title card, your name strap and a closing line. You can change anything afterwards.</p>
            </div>

            <fieldset disabled={busy} className="space-y-3">
              <legend className="text-sm font-semibold">Trim</legend>
              <label className="block text-xs text-zinc-500">Start at {clock(trimStart)}
                <input type="range" className={range} min={0} max={duration || 0} step={0.1} value={trimStart} onChange={(e) => { const v = Math.min(Number(e.target.value), trimEnd - 0.5); setTrimStart(Math.max(0, v)); if (videoRef.current) videoRef.current.currentTime = Math.max(0, v); }} />
              </label>
              <label className="block text-xs text-zinc-500">End at {clock(trimEnd)}
                <input type="range" className={range} min={0} max={duration || 0} step={0.1} value={trimEnd} onChange={(e) => { const v = Math.max(Number(e.target.value), trimStart + 0.5); setTrimEnd(Math.min(duration, v)); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, v); }} />
              </label>
            </fieldset>

            <fieldset disabled={busy} className="space-y-2">
              <legend className="text-sm font-semibold">Cuts</legend>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={removePauses} onChange={(e) => togglePauses(e.target.checked)} />Remove pauses and dead air</label>
              {analysing === "working" && <p className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Listening for pauses…</p>}
              {analysing === "failed" && <p role="alert" className="text-xs text-amber-700">Couldn&apos;t read this video&apos;s audio, so pauses can&apos;t be found here. Trim still works.</p>}
              {analysing === "too-large" && <p role="alert" className="text-xs text-amber-700">This video is too large to scan for pauses in the browser. Use the tidy-up step for that.</p>}
              <label className={cn("block text-xs text-zinc-500", !removePauses && "opacity-50")}>Pause sensitivity
                <input type="range" className={range} min={0} max={1} step={0.05} value={sensitivity} disabled={!removePauses} onChange={(e) => setSensitivity(Number(e.target.value))} />
              </label>
            </fieldset>

            <div className="space-y-2">
              <p className="text-sm font-semibold">Template</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Look of the on-screen text">
                {(Object.keys(TEMPLATES) as Template[]).map((key) => (
                  <button key={key} type="button" disabled={busy} aria-pressed={template === key} onClick={() => setTemplate(key)}
                    className={cn("focus-ring h-9 rounded-lg px-4 text-sm font-medium", template === key ? "bg-primary text-white" : "border border-border bg-white hover:bg-zinc-50")}>{TEMPLATES[key].label}</button>
                ))}
              </div>
            </div>

            <fieldset disabled={busy} className="space-y-3">
              <legend className="text-sm font-semibold">On-screen text</legend>
              <label className="block text-xs text-zinc-500">Title card<input className={field} value={titleCard} maxLength={90} onChange={(e) => setTitleCard(e.target.value)} placeholder="What this video is about" /></label>
              <label className="block text-xs text-zinc-500">Title subline<input className={field} value={subline} maxLength={90} onChange={(e) => setSubline(e.target.value)} placeholder="Optional" /></label>
              <label className="block text-xs text-zinc-500">Name strap<input className={field} value={nameStrap} maxLength={60} onChange={(e) => setNameStrap(e.target.value)} placeholder="Name, role" /></label>
              <label className="block text-xs text-zinc-500">Closing line<input className={field} value={cta} maxLength={90} onChange={(e) => setCta(e.target.value)} placeholder="See you in the next lesson" /></label>
              <label className={cn("flex items-center gap-2 text-sm", !cues.length && "opacity-50")}>
                <input type="checkbox" className="accent-primary" checked={burnCaptions && cues.length > 0} disabled={!cues.length} onChange={(e) => setBurnCaptions(e.target.checked)} />Burn in captions
              </label>
              {!cues.length && <p className="text-xs text-zinc-500">No captions for this video yet. Add a subtitle file below, or leave it: YouTube adds its own captions after upload.</p>}
              <label className="block text-xs text-zinc-500">{cues.length ? "Replace the captions file" : "Add a captions file (.vtt or .srt)"}
                <input type="file" accept=".vtt,.srt,text/vtt" className="mt-1 block w-full text-xs text-zinc-600 file:mr-2 file:rounded-lg file:border file:border-border file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium" onChange={(e) => void loadCaptions(e.target.files?.[0])} />
              </label>
              {captionNote && <p role="status" className="text-xs text-zinc-600">{captionNote}</p>}
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
}
