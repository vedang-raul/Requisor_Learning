"use client";

import { isStopUtterance, isWakeUtterance, STOP_GRAMMAR, WAKE_GRAMMAR } from "@/lib/accessibility/voice-commands";

/**
 * "Hey Requisor": listens for the wake phrase on this device with Vosk
 * (vosk-browser, WebAssembly). Audio never leaves the browser here — only
 * what the person says *after* the wake phrase is recorded and transcribed,
 * by the normal voice input. Opt-in, per device, and only while the tab is open.
 *
 * The model (public/vosk/…, ~40 MB, fetched at build time by
 * scripts/fetch-vosk-model.js) downloads once and is then kept in the
 * browser's storage. vosk-browser itself (~6 MB) loads only when this starts.
 */
export const WAKE_MODEL_URL = "/vosk/vosk-model-small-en-us-0.15.tar.gz";
/**
 * vosk-browser's worker, written out as a real file by the fetch script and
 * served with its own security policy by src/middleware.ts (it needs eval-style
 * code generation, which the page itself never allows).
 */
export const WAKE_WORKER_URL = "/vosk/vosk-worker.js";
/** Ignore further detections for this long after one, so one phrase wakes once. */
const COOLDOWN_MS = 2500;

export type WakeState = "loading" | "listening" | "paused" | "error";

/**
 * What to listen for right now: the wake phrase (while idle), "stop" (while
 * the assistant is talking, so it can be interrupted), both, or neither
 * (e.g. while the normal voice input is recording).
 */
export type ListenMode = { wake: boolean; stop: boolean };

export type WakeWordListener = {
  setMode(mode: ListenMode): void;
  /** Release the microphone and the recogniser. */
  stop(): void;
};

/** Whether the wake-word model and worker were installed on this server (see the fetch script). */
export async function wakeWordAvailable(): Promise<boolean> {
  try {
    const [model, worker] = await Promise.all([
      fetch(WAKE_MODEL_URL, { method: "HEAD" }),
      fetch(WAKE_WORKER_URL, { method: "HEAD" }),
    ]);
    return model.ok && worker.ok;
  } catch {
    return false;
  }
}

/**
 * Opens the model with vosk-browser, but in our worker file instead of the
 * blob: worker it would build (which would run under the page's policy). The
 * library creates its worker synchronously while constructing the model, so
 * Worker is swapped only for that moment.
 */
function createModelInWorkerFile(vosk: typeof import("vosk-browser"), url: string) {
  const RealWorker = window.Worker;
  const FileWorker = function (_blobUrl: string | URL, options?: WorkerOptions) {
    return new RealWorker(WAKE_WORKER_URL, options);
  } as unknown as typeof Worker;
  window.Worker = FileWorker;
  try {
    return vosk.createModel(url);
  } finally {
    window.Worker = RealWorker;
  }
}

export async function startWakeWord(handlers: {
  onWake: () => void;
  onStop?: () => void;
  onState?: (state: WakeState, detail?: string) => void;
}): Promise<WakeWordListener> {
  const { onWake, onStop, onState } = handlers;
  onState?.("loading");

  let stopped = false;
  let mode: ListenMode = { wake: false, stop: false };
  let lastWake = 0;
  let stopHeard = false; // one "stop" per utterance (partials repeat it)
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let model: { terminate(): void } | null = null;
  let recognizer: { remove(): void } | null = null;

  const release = () => {
    stopped = true;
    try { processor?.disconnect(); } catch { /* already */ }
    processor = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    context?.close().catch(() => {});
    context = null;
    try { recognizer?.remove(); } catch { /* already */ }
    recognizer = null;
    try { model?.terminate(); } catch { /* already */ }
    model = null;
  };

  try {
    const vosk = await import("vosk-browser");
    if (stopped) throw new Error("stopped");
    const loaded = await createModelInWorkerFile(vosk, WAKE_MODEL_URL);
    model = loaded;
    if (stopped) { release(); throw new Error("stopped"); }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    context = new AC();
    const rec = new loaded.KaldiRecognizer(context.sampleRate, JSON.stringify([...STOP_GRAMMAR, ...WAKE_GRAMMAR]));
    recognizer = rec;

    const check = (text: unknown, final: boolean) => {
      if (stopped || typeof text !== "string") return;
      const heardStop = !stopHeard && text !== "" && isStopUtterance(text);
      if (final) stopHeard = false;
      if (!text || (!mode.wake && !mode.stop)) return;
      // Development only: lets the wake phrase be tuned against real recognitions.
      if (process.env.NODE_ENV !== "production") {
        window.dispatchEvent(new CustomEvent("requisor:wake-heard", { detail: { text, final } }));
      }
      // "Stop" acts on the first partial guess, so it cuts the assistant off at once.
      if (mode.stop && heardStop) {
        if (!final) stopHeard = true;
        onStop?.();
        return;
      }
      if (!mode.wake) return;
      // Only a finished recognition (after a pause) can wake, and only if it's the
      // phrase on its own — partial guesses like "hey request sir" for "hey,
      // request a quiz" would otherwise wake it mid-sentence.
      const now = Date.now();
      if (!final || now - lastWake < COOLDOWN_MS || !isWakeUtterance(text)) return;
      lastWake = now;
      onWake();
    };
    rec.on("result", (message) => check((message as { result?: { text?: string } }).result?.text, true));
    rec.on("partialresult", (message) => check((message as { result?: { partial?: string } }).result?.partial, false));

    const source = context.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but universally supported, and needs no extra worklet file.
    processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      if (stopped || (!mode.wake && !mode.stop)) return;
      try { (rec as unknown as { acceptWaveform(b: AudioBuffer): void }).acceptWaveform(event.inputBuffer); } catch { /* skip a frame */ }
    };
    source.connect(processor);
    processor.connect(context.destination);
    onState?.("paused");
  } catch (error) {
    release();
    const message = error instanceof Error ? error.message : String(error);
    if (message !== "stopped") onState?.("error", message);
    throw error;
  }

  return {
    setMode(next) {
      if (stopped) return;
      mode = next;
      onState?.(next.wake || next.stop ? "listening" : "paused");
    },
    stop() { release(); },
  };
}
