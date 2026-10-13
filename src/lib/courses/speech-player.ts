import type { ApprovedSpeechKey } from "./speech-types";
import { narrationText, speechChunks } from "./speech-text";

export interface SpeechPlaybackState {
  loading: boolean;
  isSpeaking: boolean;
  error: string | null;
}
export interface SpeechPlayerDependencies {
  fetch: typeof fetch;
  createAudio: (url: string) => HTMLAudioElement;
  createUrl: (blob: Blob) => string;
  revokeUrl: (url: string) => void;
}
const IDLE: SpeechPlaybackState = { loading: false, isSpeaking: false, error: null };

/** One owner of reply, preview and phrase audio; epochs reject stale requests. */
export class SpeechPlayer {
  private epoch = 0;
  private controller: AbortController | null = null;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private queue: string[] = [];
  constructor(private deps: SpeechPlayerDependencies, private onState: (state: SpeechPlaybackState) => void) {}

  stop() {
    ++this.epoch;
    this.queue = [];
    this.controller?.abort();
    this.controller = null;
    if (this.audio) {
      this.audio.onplaying = this.audio.onended = this.audio.onerror = this.audio.onpause = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.url) this.deps.revokeUrl(this.url);
    this.url = null;
    this.onState({ ...IDLE });
  }

  async play(contentKey: ApprovedSpeechKey, voiceKey: string) {
    this.stop();
    await this.playRequest({ contentKey, voiceKey });
  }

  async speak(text: string, voiceKey: string, chunkSize = 500) {
    this.stop();
    if (text.length > 50_000) {
      this.onState({ ...IDLE, error: "This reply is too long to read aloud." });
      return;
    }
    this.queue = speechChunks(narrationText(text), chunkSize);
    const first = this.queue.shift();
    if (first) await this.playRequest({ text: first, voiceKey });
  }

  private async playRequest(payload: { voiceKey: string; contentKey: ApprovedSpeechKey } | { voiceKey: string; text: string }) {
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    const current = () => epoch === this.epoch && !controller.signal.aborted;
    this.onState({ loading: true, isSpeaking: false, error: null });
    const timer = setTimeout(() => {
      if (!current()) return;
      this.stop();
      this.onState({ ...IDLE, error: "Speech took too long. Please try again." });
    }, 65_000);
    try {
      const response = await this.deps.fetch("/api/speech/", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      if (!current()) return;
      if (!response.ok) throw new Error("speech_response");
      if (response.headers.get("content-type")?.split(";")[0] !== "audio/mpeg") throw new Error("speech_type");
      const blob = await response.blob();
      if (!current()) return;
      if (!blob.size || blob.size > 1024 * 1024) throw new Error("speech_size");
      this.url = this.deps.createUrl(blob);
      const audio = this.deps.createAudio(this.url);
      this.audio = audio;
      audio.onplaying = () => {
        if (current()) this.onState({ loading: false, isSpeaking: true, error: null });
      };
      audio.onpause = () => {
        if (current()) this.onState({ ...IDLE });
      };
      audio.onended = () => {
        if (!current()) return;
        const next = this.queue.shift();
        const remaining = this.queue;
        this.stop();
        if (next) {
          this.queue = remaining;
          void this.playRequest({ text: next, voiceKey: payload.voiceKey });
        }
      };
      audio.onerror = () => {
        if (!current()) return;
        this.stop();
        this.onState({ ...IDLE, error: "Audio could not be played. Please try again." });
      };
      await audio.play();
      // A stale play promise can finish after stop; never resurrect feedback.
      if (!current()) audio.pause();
    } catch {
      if (!current()) return;
      this.stop();
      this.onState({ ...IDLE, error: "Speech is unavailable or playback was blocked. Please try again." });
    } finally {
      clearTimeout(timer);
    }
  }
}
