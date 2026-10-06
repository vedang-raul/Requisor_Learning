"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Camera, CircleDot, Download, ExternalLink, Loader2, MonitorUp, Pause, Play, RotateCcw, Scissors, ScrollText, Square, Wand2, X, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoEditStudio } from "@/components/video-edit-studio";
import { VideoEditor, type EditorSource } from "@/components/video-editor";
import { followSpeech, normalizeWord, parseScript } from "@/lib/teleprompter";
import { cn } from "@/lib/utils";

/**
 * Lesson recording. The wizard's Record tab (RecordStudio) opens the recorder
 * (VideoRecorder, at /app/tutor/record/) in its own browser tab, where it takes
 * over the whole screen: a tutor records camera only, or their screen with the
 * camera in a corner bubble, then downloads the video, uploads it to YouTube
 * and pastes the link (lessons play from YouTube; the app does not host video).
 *
 * An optional teleprompter scrolls the tutor's script near the top of the
 * screen, close to the camera. When recording the screen it can instead float
 * in a small always-on-top window (see Teleprompter below).
 *
 * The recording is made and kept in the tutor's browser. Nothing is uploaded
 * unless they choose the optional tidy-up, which sends it to the editing
 * service (see VideoEditStudio).
 */

type Mode = "camera" | "screen";
type Phase = "idle" | "starting" | "ready" | "recording" | "paused" | "review";
type Recording = { file: File; url: string; seconds: number };

/** The recorder tab hands finished recordings back to the lesson wizard's tab over this channel. */
const RECORDER_CHANNEL = "requisor-recorder";
type RecorderMessage = { rid: string; file: File; seconds: number };

/** MP4 where the browser can record it (plays everywhere); WebM otherwise. YouTube accepts both. */
const MIME_CANDIDATES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
/** The recording is held in memory until it is downloaded, so nudge long sessions to wrap up. */
const LONG_RECORDING_SECONDS = 30 * 60;

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
}
function formatBytes(bytes: number) {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function describeError(error: unknown, mode: Mode): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return mode === "screen"
      ? "Recording was cancelled or blocked. Choose a screen to share and allow the camera and microphone, then try again."
      : "Camera or microphone access was blocked. Allow it from the icon in your browser's address bar, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera or microphone was found on this device.";
  if (name === "NotReadableError") return "Your camera or microphone is being used by another app. Close it and try again.";
  return "Recording couldn't start in this browser. Try the latest Chrome, Edge or Firefox on a computer.";
}

/** A hidden <video> playing a stream, so its frames can be drawn onto the canvas. */
async function playable(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);
  return video;
}

/* ---------- pop-out recording controls + teleprompter ---------- */

type DocumentPictureInPicture = { requestWindow(options: { width: number; height: number }): Promise<Window> };
const PROMPTER_SIZE = { width: 560, height: 320 };

// The pop-out is a separate document without the app's stylesheet, so the teleprompter is styled inline.
const GREEN = "#4ade80";
const AMBER = "#fbbf24";
const promptStyles = {
  root: { display: "flex", flexDirection: "column", height: "100%", background: "#000", color: "#f5f5f5", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" },
  bar: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, padding: "6px 8px", background: "#111214", borderBottom: "1px solid #232427", fontSize: 12 },
  button: { border: "1px solid #303236", background: "#1c1d20", color: "#f5f5f5", borderRadius: 6, padding: "4px 9px", fontSize: 12, fontWeight: 500, cursor: "pointer", lineHeight: 1.3 },
  go: { border: "1px solid " + GREEN, background: GREEN, color: "#052e16", borderRadius: 6, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", lineHeight: 1.3 },
  stop: { border: "1px solid #dc2626", background: "#dc2626", color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", lineHeight: 1.3 },
  speed: { color: "#8b8f98", fontSize: 11, minWidth: 46, textAlign: "center", fontVariantNumeric: "tabular-nums" },
  status: { display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, fontVariantNumeric: "tabular-nums", marginRight: "auto" },
} satisfies Record<string, CSSProperties>;

/** How far down the script area the words being spoken are kept. */
const FOCUS_LINE = 0.3;
/** Words just ahead of the speaker stay readable; everything further on is blurred out. */
const READ_AHEAD_WORDS = 12;

type SpeechResults = { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string } } };
type SpeechRecognizer = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: SpeechResults }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
function speechRecognizer(): (new () => SpeechRecognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The script as lyrics: words light up as the tutor says them, the next few
 * stay readable, and the rest is blurred out. With "Voice" on it listens and
 * follows the tutor's own pace (browser speech recognition); otherwise, or
 * where that isn't available, it moves at the chosen speed. Clicking a word
 * jumps to it.
 *
 * Shown either over the recorder's preview (compact) or in the pop-out window,
 * where it also carries the recording status and controls. Timed movement runs
 * on its own window's animation frames, because the app's tab is usually in
 * the background while a tutor presents from the pop-out.
 */
function Teleprompter({
  win, script, phase, seconds, onStart, onTogglePause, onStop, compact = false,
}: {
  win: Window; script: string; phase: Phase; seconds: number; compact?: boolean;
  onStart: () => void; onTogglePause: () => void; onStop: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [spoken, setSpokenState] = useState(0);
  const spokenRef = useRef(0);
  const [speed, setSpeed] = useState(3); // 1-15, for timed movement
  const [fontSize, setFontSize] = useState(compact ? 22 : 30);
  const [mirrored, setMirrored] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canListen] = useState(() => speechRecognizer() !== null);
  const [voice, setVoice] = useState(canListen);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  const { blocks, words } = useMemo(() => parseScript(script), [script]);
  const normalized = useMemo(() => words.map(normalizeWord), [words]);

  // Voice tracking keeps two positions: "confirmed" is where the recogniser has
  // heard the tutor reach; "spoken" (what is lit) may run a few words ahead of
  // it, because recognition always arrives a beat late.
  const confirmedRef = useRef(0);
  const heardTail = useRef<string[]>([]);
  const jumpedAt = useRef(0);

  function setSpoken(next: number) {
    const clamped = Math.max(0, Math.min(words.length, next));
    spokenRef.current = clamped;
    setSpokenState(clamped);
  }
  /** The tutor moved the position themselves (clicked a word, Restart). */
  function jumpTo(next: number) {
    setSpoken(next);
    confirmedRef.current = spokenRef.current;
    heardTail.current = [];
    jumpedAt.current = performance.now();
  }

  // The script moves with the recording: it starts, pauses and resumes together.
  useEffect(() => { setRunning(phase === "recording"); }, [phase]);

  // Voice: listen and move to wherever the tutor has got to.
  useEffect(() => {
    const Recognizer = speechRecognizer();
    if (!running || !voice || !Recognizer) return;
    let stopped = false;
    let recognizer: SpeechRecognizer | null = null;
    let lastHeardAt = 0;      // when speech last arrived
    let lastConfirmedAt = 0;  // when the confirmed position last moved
    let pace = 2.4;           // the tutor's speaking rate, words a second (learned as they go)
    confirmedRef.current = Math.max(confirmedRef.current, 0);

    const listen = () => {
      if (stopped) return;
      const rec = new Recognizer();
      recognizer = rec;
      rec.lang = navigator.language || "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (event) => {
        const now = performance.now();
        // Just after a manual jump, what's in the air still belongs to the old place.
        if (now - jumpedAt.current < 1000) { heardTail.current = []; return; }
        const interim: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const heard = event.results[i][0].transcript.split(/\s+/).map(normalizeWord).filter(Boolean);
          if (event.results[i].isFinal) heardTail.current = [...heardTail.current, ...heard].slice(-6);
          else interim.push(...heard);
        }
        // The recogniser keeps revising its latest guess, so always work from
        // the newest few words as a whole rather than word by word.
        const tail = [...heardTail.current, ...interim].slice(-6);
        if (!tail.length) return;
        lastHeardAt = now;
        const next = followSpeech(normalized, confirmedRef.current, tail);
        if (next > confirmedRef.current) {
          const elapsed = (now - lastConfirmedAt) / 1000;
          if (lastConfirmedAt && elapsed > 0.15 && elapsed < 4) {
            pace = Math.min(4.5, Math.max(1.2, pace * 0.7 + ((next - confirmedRef.current) / elapsed) * 0.3));
          }
          lastConfirmedAt = now;
          confirmedRef.current = next;
          if (next > spokenRef.current) setSpoken(next);
        }
      };
      rec.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") {
          stopped = true;
          setVoice(false);
          setVoiceNote("Voice follow isn't available here, so the script moves at the set speed.");
        }
      };
      // The browser ends a session after a pause in speech; pick straight back up while recording.
      rec.onend = () => { if (!stopped) win.setTimeout(listen, 60); };
      try { rec.start(); } catch { /* already started */ }
    };
    listen();

    // Recognition reports each word a beat after it is said. While the tutor
    // is clearly still talking, carry on at their pace for a few words past
    // the last confirmed one, so the lit words keep up with the voice instead
    // of trailing it. It never runs far ahead, and waits when they stop.
    const LEAD_WORDS = 4;
    let frame = 0;
    const keepUp = () => {
      const now = performance.now();
      if (lastConfirmedAt && now - lastHeardAt < 1300) {
        const lead = Math.min(LEAD_WORDS, Math.floor(((now - lastConfirmedAt) / 1000) * pace));
        const target = Math.min(words.length, confirmedRef.current + lead);
        if (target > spokenRef.current) setSpoken(target);
      }
      frame = win.requestAnimationFrame(keepUp);
    };
    frame = win.requestAnimationFrame(keepUp);

    return () => { stopped = true; win.cancelAnimationFrame(frame); try { recognizer?.abort(); } catch { /* not running */ } };
    // setSpoken only touches refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, voice, normalized, win, words.length]);

  // No voice: move on at the chosen speed (speed 3 is a relaxed speaking pace).
  useEffect(() => {
    if (!running || (voice && canListen)) return;
    const wordsPerSecond = 0.6 + speed * 0.4;
    let frame = 0;
    let last = 0;
    let carried = 0;
    const step = (now: number) => {
      if (last) {
        carried += ((now - last) / 1000) * wordsPerSecond;
        if (carried >= 1) { const whole = Math.floor(carried); carried -= whole; setSpoken(spokenRef.current + whole); }
      }
      last = now;
      frame = win.requestAnimationFrame(step);
    };
    frame = win.requestAnimationFrame(step);
    return () => win.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, voice, canListen, speed, win, words.length]);

  // Keep the word being spoken at the focus line.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const current = box.querySelector<HTMLElement>('[data-word="' + Math.min(spoken, Math.max(0, words.length - 1)) + '"]');
    if (!current) return;
    const top = current.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: Math.max(0, top - box.clientHeight * FOCUS_LINE), behavior: "smooth" });
  }, [spoken, fontSize, words.length]);

  async function copyText() {
    try {
      await win.navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable: nothing to do */ }
  }

  /** Said: bright. About to be said: readable. Later: blurred out. */
  const wordStyle = (index: number): CSSProperties => {
    const base: CSSProperties = { transition: "opacity 0.45s ease, filter 0.45s ease, color 0.45s ease", cursor: "pointer" };
    if (index < spoken) return { ...base, opacity: 1, filter: "none", color: "#ffffff" };
    if (index < spoken + READ_AHEAD_WORDS) return { ...base, opacity: 0.62, filter: "blur(0.4px)", color: "#e5e7eb" };
    return { ...base, opacity: 0.3, filter: "blur(2.6px)", color: "#d4d4d8" };
  };
  /** Headings and notes come into focus together with the words that follow them. */
  const markStyle = (at: number): CSSProperties =>
    at <= spoken + READ_AHEAD_WORDS ? { opacity: at < spoken ? 0.55 : 1, filter: "none", transition: "opacity 0.45s ease, filter 0.45s ease" }
      : { opacity: 0.35, filter: "blur(2px)", transition: "opacity 0.45s ease, filter 0.45s ease" };

  const hasScript = blocks.length > 0;
  const recordingNow = phase === "recording" || phase === "paused";
  const small = Math.max(11, Math.round(fontSize * 0.46));
  const timed = !(voice && canListen);
  return (
    <div style={promptStyles.root}>
      <div style={promptStyles.bar}>
        {!compact && (
          <span style={promptStyles.status} role="status">
            <span style={{ width: 8, height: 8, borderRadius: 999, background: phase === "recording" ? "#ef4444" : phase === "paused" ? "#f59e0b" : "#6b7280" }} />
            {phase === "recording" ? "Recording" : phase === "paused" ? "Paused" : "Ready"} · {clock(seconds)}
          </span>
        )}
        {!compact && phase === "ready" && <button type="button" style={promptStyles.stop} onClick={onStart}>Start recording</button>}
        {!compact && recordingNow && <button type="button" style={promptStyles.button} onClick={onTogglePause}>{phase === "paused" ? "Resume" : "Pause"}</button>}
        {!compact && recordingNow && <button type="button" style={promptStyles.stop} onClick={onStop}>Stop</button>}
        {hasScript && (
          <>
            <button type="button" style={{ ...promptStyles.go, marginLeft: compact ? 0 : 8 }} aria-label={running ? "Pause the script" : "Start the script"} onClick={() => setRunning((on) => !on)}>{running ? "Pause" : "Start"}</button>
            {canListen && (
              <button
                type="button" aria-pressed={!timed} title="Follow my voice: words light up as you say them"
                style={{ ...promptStyles.button, ...(!timed ? { borderColor: GREEN, color: GREEN } : {}) }}
                onClick={() => { setVoiceNote(null); setVoice((on) => !on); }}
              >Voice</button>
            )}
            <button type="button" style={{ ...promptStyles.button, opacity: timed ? 1 : 0.4 }} disabled={!timed} aria-label="Slower" onClick={() => setSpeed((v) => Math.max(1, v - 1))}>−</button>
            <span style={{ ...promptStyles.speed, opacity: timed ? 1 : 0.4 }}>Speed {speed}</span>
            <button type="button" style={{ ...promptStyles.button, opacity: timed ? 1 : 0.4 }} disabled={!timed} aria-label="Faster" onClick={() => setSpeed((v) => Math.min(15, v + 1))}>+</button>
            <button type="button" style={promptStyles.button} aria-label="Smaller text" onClick={() => setFontSize((v) => Math.max(14, v - 2))}>A−</button>
            <button type="button" style={promptStyles.button} aria-label="Larger text" onClick={() => setFontSize((v) => Math.min(64, v + 2))}>A+</button>
            <button type="button" style={promptStyles.button} onClick={() => jumpTo(0)}>Restart</button>
            <button type="button" style={{ ...promptStyles.button, ...(mirrored ? { borderColor: GREEN, color: GREEN } : {}) }} aria-pressed={mirrored} onClick={() => setMirrored((on) => !on)}>Mirror</button>
            <button type="button" style={promptStyles.button} onClick={() => void copyText()}>{copied ? "Copied" : "Copy text"}</button>
          </>
        )}
      </div>
      {voiceNote && <p role="status" style={{ margin: 0, padding: "4px 10px", fontSize: 11, color: AMBER, background: "#111214" }}>{voiceNote}</p>}
      <div ref={boxRef} style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", containerType: "size" }}>
        {hasScript ? (
          // Space above starts the first line at the focus line; space below lets the last line reach it.
          <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px", paddingTop: FOCUS_LINE * 100 + "cqh", paddingBottom: "100cqh", transform: mirrored ? "scaleX(-1)" : undefined }}>
            {blocks.map((block, i) => block.kind === "heading" ? (
              <p key={i} style={{ margin: "18px 0 6px", fontSize: small, fontWeight: 700, color: GREEN, ...markStyle(block.at) }}>
                {block.text}{block.time && <span style={{ marginLeft: 10, fontWeight: 500, color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>{block.time}</span>}
              </p>
            ) : block.kind === "cue" ? (
              <p key={i} style={{ margin: "10px 0", paddingLeft: 12, borderLeft: "2px solid " + AMBER, fontSize: small, fontStyle: "italic", color: AMBER, ...markStyle(block.at) }}>{block.text}</p>
            ) : (
              <p key={i} style={{ margin: "0 0 14px", fontSize, lineHeight: 1.5, fontWeight: 500, letterSpacing: "0.005em" }}>
                {block.words.map((word, j) => (
                  <span key={j} data-word={block.at + j} style={wordStyle(block.at + j)} onClick={() => jumpTo(block.at + j)}>{word}{" "}</span>
                ))}
              </p>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, padding: "16px", fontSize: 13, color: "#8b8f98", textAlign: "center" }}>
            No script. Add one in the recorder before you start if you want a teleprompter; this window still works as your recording controls.
          </p>
        )}
      </div>
    </div>
  );
}

export function VideoRecorder({
  lessonTitle, sessionId,
}: {
  lessonTitle: string;
  /** Ties this recorder tab to the wizard tab that opened it, so the recording can be handed back. */
  sessionId: string;
}) {
  const [mode, setMode] = useState<Mode>("camera");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canShareScreen, setCanShareScreen] = useState(true);
  const [script, setScript] = useState("");
  const [prompter, setPrompter] = useState<Window | null>(null);
  /** The pop-out floats above other windows (Chrome/Edge); otherwise it is an ordinary pop-up. */
  const [prompterOnTop, setPrompterOnTop] = useState(false);
  const prompterRef = useRef<Window | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null);
  const outputRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const secondsRef = useRef(0);
  /** Everything that must be shut down when capture ends: tracks, the frame clock, the audio mixer. */
  const cleanupRef = useRef<Array<() => void>>([]);

  useEffect(() => { setCanShareScreen(Boolean(navigator.mediaDevices?.getDisplayMedia)); }, []);

  /**
   * Opens the pop-out with the recording controls and the teleprompter. Must
   * run from a click. Chrome and Edge give an always-on-top window; other
   * browsers get a normal pop-up at the top of the screen.
   */
  async function openPrompter() {
    const existing = prompterRef.current;
    if (existing && !existing.closed) { existing.focus(); return; }
    setError(null);
    const pip = (window as unknown as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture;
    let win: Window | null = null;
    let onTop = false;
    if (pip) {
      try { win = await pip.requestWindow(PROMPTER_SIZE); onTop = true; } catch { /* fall back to a pop-up */ }
    }
    if (!win) {
      const left = Math.max(0, Math.round((window.screen.availWidth - PROMPTER_SIZE.width) / 2));
      win = window.open("", "requisor-teleprompter", `popup,width=${PROMPTER_SIZE.width},height=${PROMPTER_SIZE.height},left=${left},top=0`);
    }
    if (!win) { setError("Your browser blocked the teleprompter window. Allow pop-ups for this site, then try again."); return; }
    win.document.title = "Recording · Teleprompter";
    win.document.body.innerHTML = "";
    win.document.body.style.margin = "0";
    win.document.body.style.height = "100vh";
    win.addEventListener("pagehide", () => { if (prompterRef.current === win) { prompterRef.current = null; setPrompter(null); } });
    prompterRef.current = win;
    setPrompterOnTop(onTop);
    setPrompter(win);
  }

  function closePrompter() {
    const win = prompterRef.current;
    prompterRef.current = null;
    setPrompter(null);
    if (win && !win.closed) win.close();
  }

  function release() {
    for (const stop of cleanupRef.current.splice(0)) { try { stop(); } catch { /* already stopped */ } }
    outputRef.current = null;
  }
  // Leaving the step mid-recording must switch the camera light off.
  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") { recorderRef.current.onstop = null; recorderRef.current.stop(); }
    release();
    closePrompter();
  }, []);
  useEffect(() => () => { if (recording) URL.revokeObjectURL(recording.url); }, [recording]);

  // The preview element only exists once capture is ready.
  useEffect(() => {
    if ((phase === "ready" || phase === "recording" || phase === "paused") && previewRef.current && outputRef.current) {
      if (previewRef.current.srcObject !== outputRef.current) previewRef.current.srcObject = outputRef.current;
    }
  }, [phase]);

  // One tick a second while recording (paused time doesn't count).
  useEffect(() => {
    if (phase !== "recording") return;
    const timer = setInterval(() => { secondsRef.current += 1; setSeconds(secondsRef.current); }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  function track(stream: MediaStream) {
    cleanupRef.current.push(() => stream.getTracks().forEach((t) => t.stop()));
    return stream;
  }

  /** Screen with the camera drawn as a circle in the corner, plus microphone and any shared tab/system audio. */
  async function composeScreenAndCamera(screen: MediaStream, camera: MediaStream): Promise<MediaStream> {
    const [screenVideo, cameraVideo] = await Promise.all([playable(screen), playable(camera)]);
    const settings = screen.getVideoTracks()[0]?.getSettings() ?? {};
    const sourceW = settings.width || screenVideo.videoWidth || 1280;
    const sourceH = settings.height || screenVideo.videoHeight || 720;
    const scale = Math.min(1, 1920 / sourceW, 1080 / sourceH);
    const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = even(sourceW * scale);
    canvas.height = even(sourceH * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");

    const draw = () => {
      const { width: w, height: h } = canvas;
      ctx.drawImage(screenVideo, 0, 0, w, h);
      const cw = cameraVideo.videoWidth, ch = cameraVideo.videoHeight;
      if (!cw || !ch) return;
      const d = Math.round(h * 0.24), margin = Math.round(h * 0.03);
      const cx = margin + d / 2, cy = h - margin - d / 2;
      const side = Math.min(cw, ch); // centre-crop the camera to a square
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(cx + d / 2, cy - d / 2);
      ctx.scale(-1, 1); // mirrored, the way people expect to see themselves
      ctx.drawImage(cameraVideo, (cw - side) / 2, (ch - side) / 2, side, side, 0, 0, d, d);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, Math.round(h * 0.004));
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    };
    draw();
    // Frames are driven by a worker so they keep coming while this tab is in
    // the background (see public/record-tick.js); a plain timer is the fallback.
    try {
      const clockWorker = new Worker("/record-tick.js");
      clockWorker.onmessage = draw;
      cleanupRef.current.push(() => clockWorker.terminate());
    } catch {
      const timer = setInterval(draw, 1000 / 30);
      cleanupRef.current.push(() => clearInterval(timer));
    }

    const tracks: MediaStreamTrack[] = [...canvas.captureStream(30).getVideoTracks()];
    const withAudio = [camera, screen].filter((s) => s.getAudioTracks().length > 0);
    if (withAudio.length === 1) {
      tracks.push(...withAudio[0].getAudioTracks());
    } else if (withAudio.length > 1) {
      const audio = new AudioContext();
      const mixed = audio.createMediaStreamDestination();
      for (const s of withAudio) audio.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(mixed);
      cleanupRef.current.push(() => void audio.close());
      tracks.push(...mixed.stream.getAudioTracks());
    }
    return new MediaStream(tracks);
  }

  async function prepare() {
    setError(null);
    setPhase("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      if (mode === "camera") {
        outputRef.current = track(await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true }));
      } else {
        const screen = track(await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true }));
        const camera = track(await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: true }));
        outputRef.current = await composeScreenAndCamera(screen, camera);
        // The browser's own "Stop sharing" button ends the recording too.
        screen.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
          else { closePrompter(); release(); setPhase("idle"); }
        });
      }
      setPhase("ready");
    } catch (e) {
      release();
      setPhase("idle");
      setError(describeError(e, mode));
    }
  }

  function start() {
    const stream = outputRef.current;
    if (!stream) return;
    // A script was written but the window isn't open yet: open it with the recording.
    // (Screen recordings only: with the camera alone, the script shows over the preview instead.)
    if (mode === "screen" && script.trim() && !prompterRef.current) void openPrompter();
    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    } catch {
      setError("This browser can't record video. Try the latest Chrome, Edge or Firefox.");
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    recorder.onstop = () => {
      const type = (recorder.mimeType || mimeType || "video/webm").split(";")[0];
      const blob = new Blob(chunks, { type });
      const name = `${lessonTitle.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lesson"}-recording.${type === "video/mp4" ? "mp4" : "webm"}`;
      release();
      closePrompter();
      window.focus();
      recorderRef.current = null;
      if (blob.size === 0) { setError("Nothing was recorded. Please try again."); setPhase("idle"); return; }
      const file = new File([blob], name, { type });
      setRecording({ file, url: URL.createObjectURL(blob), seconds: secondsRef.current });
      // Give the lesson's tab a copy, for the optional tidy-up there.
      if (sessionId && typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(RECORDER_CHANNEL);
        channel.postMessage({ rid: sessionId, file, seconds: secondsRef.current } satisfies RecorderMessage);
        channel.close();
      }
      setPhase("review");
    };
    secondsRef.current = 0;
    setSeconds(0);
    recorder.start(1000);
    recorderRef.current = recorder;
    setPhase("recording");
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") { recorder.pause(); setPhase("paused"); }
    else if (recorder.state === "paused") { recorder.resume(); setPhase("recording"); }
  }

  function cancelSetup() {
    closePrompter();
    release();
    setPhase("idle");
  }

  function recordAgain() {
    if (!window.confirm("Discard this recording and start again? Download it first if you want to keep it.")) return;
    setRecording(null);
    setError(null);
    setPhase("idle");
  }

  const live = phase === "ready" || phase === "recording" || phase === "paused";
  const hasScript = script.trim().length > 0;
  const closeTab = () => { window.close(); };

  return (
    // Covers the whole tab (app sidebar, top bar and assistant included) so nothing distracts while recording.
    <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-white">
      {(phase === "idle" || phase === "starting") && (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
          <div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 text-zinc-900 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">Record your lesson</h1>
                <p className="text-sm text-zinc-600">{lessonTitle ? <>For <strong>{lessonTitle}</strong>. </> : null}The recording stays on your computer until you download it.</p>
              </div>
              <button type="button" onClick={closeTab} aria-label="Close the recorder" className="focus-ring rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
            </div>
            <div role="radiogroup" aria-label="What to record" className="grid gap-2 sm:grid-cols-2">
              {([
                { key: "camera", icon: Camera, title: "Camera", hint: "You, talking to the camera", enabled: true },
                { key: "screen", icon: MonitorUp, title: "Screen + camera", hint: canShareScreen ? "Your screen, with you in a corner bubble" : "Needs a computer browser", enabled: canShareScreen },
              ] as const).map((option) => (
                <button
                  key={option.key} type="button" role="radio" aria-checked={mode === option.key} disabled={!option.enabled || phase === "starting"}
                  onClick={() => setMode(option.key)}
                  className={cn("focus-ring flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    mode === option.key ? "border-primary bg-primary/5" : "border-border hover:bg-zinc-50")}
                >
                  <option.icon className={cn("h-5 w-5 shrink-0", mode === option.key ? "text-primary" : "text-zinc-500")} aria-hidden="true" />
                  <span><span className="block text-sm font-medium text-zinc-900">{option.title}</span><span className="block text-xs text-zinc-500">{option.hint}</span></span>
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium text-zinc-800">
              Teleprompter script <span className="font-normal text-zinc-500">(optional)</span>
              <textarea
                value={script} onChange={(e) => setScript(e.target.value)} maxLength={20000} rows={5}
                placeholder="Paste or type what you want to say. It scrolls near the top of the screen, close to your camera, while you record."
                className="focus-ring mt-1 block w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-normal text-zinc-800"
              />
              <span className="mt-1 block text-xs font-normal text-zinc-500">
                Optional marks: start a line with <code className="rounded bg-zinc-100 px-1">#</code> for a section heading (e.g. <code className="rounded bg-zinc-100 px-1"># Cold open 0:25</code>) and with <code className="rounded bg-zinc-100 px-1">&gt;</code> for a note to yourself, like <code className="rounded bg-zinc-100 px-1">&gt; Share screen</code>.
              </span>
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Button type="button" onClick={() => void prepare()} disabled={phase === "starting"}>
              {phase === "starting" ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "camera" ? <Camera className="h-4 w-4" /> : <MonitorUp className="h-4 w-4" />}
              {phase === "starting" ? "Waiting for permission…" : mode === "camera" ? "Turn on camera" : "Choose what to share"}
            </Button>
            <p className="text-xs text-zinc-500">Your browser will ask for permission to use your camera and microphone{mode === "screen" ? ", and which screen or window to share" : ""}.</p>
          </div>
        </div>
      )}

      {live && (
        <>
          <div className="relative min-h-0 flex-1">
            <video ref={previewRef} autoPlay muted playsInline className={cn("absolute inset-0 h-full w-full object-contain", mode === "camera" && "-scale-x-100")} />
            {phase !== "ready" && (
              <span role="status" className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-sm font-semibold tabular-nums text-white">
                <span className={cn("h-2.5 w-2.5 rounded-full", phase === "recording" ? "animate-pulse bg-red-500" : "bg-amber-400")} />
                {phase === "recording" ? "Recording" : "Paused"} · {clock(seconds)}
              </span>
            )}
            {/* Teleprompter: top of the screen, centred under a laptop camera (the middle two columns of a 4×4 grid).
                It sits over the preview only; it is never part of the recording. */}
            {hasScript && !prompter && (
              <div className="absolute left-1/2 top-0 h-[32%] min-h-[220px] w-1/2 min-w-[min(100%,560px)] -translate-x-1/2 overflow-hidden rounded-b-xl shadow-2xl ring-1 ring-white/15">
                <Teleprompter
                  compact win={window} script={script} phase={phase} seconds={seconds}
                  onStart={start} onTogglePause={togglePause} onStop={() => recorderRef.current?.stop()}
                />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-zinc-900 px-4 py-3">
            {phase === "ready" ? (
              <>
                <Button type="button" onClick={start}><CircleDot className="h-4 w-4" />Start recording</Button>
                <Button type="button" variant="outline" onClick={cancelSetup} className="bg-white text-zinc-900 hover:bg-zinc-100">Cancel</Button>
              </>
            ) : (
              <>
                <Button type="button" onClick={() => recorderRef.current?.stop()}><Square className="h-4 w-4" />Stop &amp; review</Button>
                <Button type="button" variant="outline" onClick={togglePause} className="bg-white text-zinc-900 hover:bg-zinc-100">
                  {phase === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{phase === "paused" ? "Resume" : "Pause"}
                </Button>
              </>
            )}
            {mode === "screen" && (
              <Button type="button" variant="outline" onClick={() => void openPrompter()} className="bg-white text-zinc-900 hover:bg-zinc-100">
                <ScrollText className="h-4 w-4" />{prompter ? "Show the floating window" : hasScript ? "Float the teleprompter" : "Float the controls"}
              </Button>
            )}
            {error && <p role="alert" className="w-full text-center text-sm text-red-300">{error}</p>}
            <p className="w-full text-center text-xs text-zinc-400">
              {mode === "screen"
                ? <>Switch to the window you&apos;re presenting and come back here to stop. The floating window {prompterOnTop || !prompter ? "stays on top in Chrome and Edge" : "is a normal window in this browser, so keep it in front"}; share a window or tab, not your entire screen, or it will be recorded too.</>
                : phase === "ready" ? "Check the picture and your microphone, then start when you're ready." : hasScript ? "Your script only shows here. It is not part of the recording." : "Recording your camera and microphone."}
              {seconds >= LONG_RECORDING_SECONDS && <span className="text-amber-300"> This is a long recording: stop and download it soon, it is kept in your browser&apos;s memory until you do.</span>}
            </p>
          </div>
        </>
      )}

      {prompter && live && createPortal(
        <Teleprompter
          win={prompter} script={script} phase={phase} seconds={seconds}
          onStart={start} onTogglePause={togglePause} onStop={() => recorderRef.current?.stop()}
        />,
        prompter.document.body
      )}

      {phase === "review" && recording && (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
          <div className="w-full max-w-3xl space-y-3 rounded-2xl bg-white p-6 text-zinc-900 shadow-xl">
            <p className="text-sm font-semibold">Your recording <span className="font-normal text-zinc-500">· {clock(recording.seconds)} · {formatBytes(recording.file.size)}</span></p>
            <video src={recording.url} controls preload="metadata" className="aspect-video w-full rounded-xl bg-black" />
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-zinc-800">
              <p className="font-semibold">Put it in your lesson</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Download the recording. It only exists in your browser until you do.</li>
                <li>Upload it to your YouTube channel (public or unlisted).</li>
                <li>Go back to the lesson and paste its YouTube link.</li>
              </ol>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={recording.url} download={recording.file.name} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-white"><Download className="h-3.5 w-3.5" />Download recording</a>
                <a href="https://www.youtube.com/upload" target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"><Youtube className="h-3.5 w-3.5" />Open YouTube upload</a>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={closeTab}><ArrowLeft className="h-3.5 w-3.5" />Back to the lesson</Button>
              <Button type="button" size="sm" variant="ghost" onClick={recordAgain}><RotateCcw className="h-3.5 w-3.5" />Record again</Button>
              <span className="text-xs text-zinc-500">{sessionId ? "The lesson's tab has this recording too, in case you want it tidied up (pauses cut, audio evened out). " : ""}If this tab doesn&apos;t close, close it yourself after downloading.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The wizard's Record tab: opens the recorder in its own tab, and offers the optional tidy-up for what comes back. */
export function RecordStudio({
  lessonTitle, courseSlug, jobId, onJobChange, onReadyToLink, onVideoPosted,
}: {
  lessonTitle: string;
  courseSlug: string;
  /** A tidy-up job in progress; kept by the wizard so returning to this step resumes it. */
  jobId: number | null;
  onJobChange: (id: number | null) => void;
  onReadyToLink: () => void;
  onVideoPosted: (videoId: string) => void;
}) {
  // Links this tab to the recorder tab it opens.
  const [sessionId] = useState(() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const [received, setReceived] = useState<Recording | null>(null);
  // null = launcher. Otherwise the tidy-up panel, optionally seeded with a recording.
  const [tidy, setTidy] = useState<{ file: File | null; seconds: number | null } | null>(jobId ? { file: null, seconds: null } : null);
  // The editor (trim, cuts, titles) covers the page while it is open.
  const [editing, setEditing] = useState<EditorSource | null>(null);
  const editor = editing ? <VideoEditor source={editing} onClose={() => setEditing(null)} /> : null;

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(RECORDER_CHANNEL);
    channel.onmessage = (event: MessageEvent<RecorderMessage>) => {
      const data = event.data;
      if (!data || data.rid !== sessionId || !(data.file instanceof Blob)) return;
      setReceived({ file: data.file, url: URL.createObjectURL(data.file), seconds: Number(data.seconds) || 0 });
    };
    return () => channel.close();
  }, [sessionId]);
  useEffect(() => () => { if (received) URL.revokeObjectURL(received.url); }, [received]);

  const recorderHref = `/app/tutor/record/?rid=${sessionId}&title=${encodeURIComponent(lessonTitle.trim().slice(0, 120))}`;

  if (tidy) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setTidy(null)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" />Back to recording
        </button>
        <VideoEditStudio
          lessonTitle={lessonTitle} courseSlug={courseSlug} jobId={jobId} onJobChange={onJobChange}
          onReadyToLink={onReadyToLink} onVideoPosted={onVideoPosted}
          presetFile={tidy.file} presetSeconds={tidy.seconds}
          onEdit={(video) => setEditing({ ...video, title: lessonTitle })}
        />
        {editor}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-border bg-white p-4">
        <p className="text-sm text-zinc-600">
          Record your lesson in a full-screen recorder that opens in a new tab: just you on camera, or your screen with you in a corner bubble.
          You can add a teleprompter script there too.
        </p>
        <a
          href={recorderHref} target="_blank" rel="opener"
          className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90"
        >
          <Camera className="h-4 w-4" />{received ? "Record again" : "Open the recorder"}<ExternalLink className="h-3.5 w-3.5 opacity-80" />
        </a>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>Record, then download the video from the recorder.</li>
          <li>Upload it to your YouTube channel (public or unlisted).</li>
          <li>Come back here and paste its YouTube link.</li>
        </ol>
        <Button type="button" size="sm" variant="outline" onClick={onReadyToLink}><Youtube className="h-4 w-4" />Paste the YouTube link</Button>
      </div>

      {received && (
        <div role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Recording received <span className="font-normal">· {clock(received.seconds)} · {formatBytes(received.file.size)}</span></p>
          <div className="flex flex-wrap items-center gap-2">
            <a href={received.url} download={received.file.name} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-900 hover:bg-emerald-100"><Download className="h-3.5 w-3.5" />Download</a>
            <Button type="button" size="sm" variant="outline" onClick={() => setTidy({ file: received.file, seconds: received.seconds })}><Wand2 className="h-3.5 w-3.5" />Tidy it up first (optional)</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ file: received.file, title: lessonTitle })}><Scissors className="h-3.5 w-3.5" />Trim &amp; add titles</Button>
            <span className="w-full text-xs">Tidy-up cleans the audio and cuts long pauses. Trim &amp; add titles opens a simple editor; you can do it after tidy-up too.</span>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Already have a video file?{" "}
        <button type="button" onClick={() => setTidy({ file: null, seconds: null })} className="font-medium text-primary hover:underline">Tidy it up</button>
        {" "}(cut long pauses, even out the audio) before uploading to YouTube.
      </p>
      {editor}
    </div>
  );
}
