import type { ApprovedSpeechKey } from "./speech-types";
import { narrationText, speechChunks, SpeechReplyBuffer } from "./speech-text";

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
type SpeechPayload = { voiceKey: string; contentKey: ApprovedSpeechKey } | { voiceKey: string; text: string };

/** One owner of reply, preview and phrase audio; epochs reject stale requests. */
export class SpeechPlayer {
  private epoch = 0;
  private controllers = new Set<AbortController>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private queue: SpeechPayload[] = [];
  private prepared: { promise: Promise<Blob | null> } | null = null;
  private advancing = false;
  private reply: SpeechReplyBuffer | null = null;
  private replyVoice = "";
  private streamOpen = false;
  constructor(private deps: SpeechPlayerDependencies, private onState: (state: SpeechPlaybackState) => void) {}

  stop() {
    ++this.epoch;
    this.queue = [];
    this.reply = null;
    this.streamOpen = false;
    this.prepared = null;
    this.advancing = false;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.releaseAudio();
    this.onState({ ...IDLE });
  }

  private releaseAudio() {
    if (this.audio) {
      this.audio.onplaying = this.audio.onended = this.audio.onerror = this.audio.onpause = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    if (this.url) this.deps.revokeUrl(this.url);
    this.url = null;
  }

  async play(contentKey: ApprovedSpeechKey, voiceKey: string) {
    this.stop();
    this.queue.push({ contentKey, voiceKey });
    await this.advance();
  }

  async speak(text: string, voiceKey: string, chunkSize = 500) {
    this.stop();
    if (text.length > 50_000) {
      this.onState({ ...IDLE, error: "This reply is too long to read aloud." });
      return;
    }
    this.queue = speechChunks(narrationText(text), chunkSize).map(text => ({ text, voiceKey }));
    await this.advance();
  }

  beginReply(voiceKey: string, chunkSize = 500) {
    this.stop();
    this.reply = new SpeechReplyBuffer(chunkSize);
    this.replyVoice = voiceKey;
    this.streamOpen = true;
  }

  updateReply(text: string, final = false) {
    if (!this.reply) return; // Stop/mute/voice changes must not restart this reply.
    try {
      this.queue.push(...this.reply.take(text, final).map(text => ({ text, voiceKey: this.replyVoice })));
      if (final) this.streamOpen = false;
      if (this.audio) this.prefetch();
      else void this.advance();
    } catch {
      this.fail(text.length > 50_000 ? "This reply is too long to read aloud." : "Speech content changed. Please try again.");
    }
  }

  private fail(message: string) {
    this.stop();
    this.onState({ ...IDLE, error: message });
  }

  /** At most one future blob and one provider request; never cache between replies. */
  private prefetch() {
    if (this.prepared || !this.queue.length) return;
    this.prepared = { promise: this.prepare(this.queue.shift()!) };
  }

  private async prepare(payload: SpeechPayload): Promise<Blob | null> {
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controllers.add(controller);
    const current = () => epoch === this.epoch && !controller.signal.aborted;
    const timer = setTimeout(() => {
      if (!current()) return;
      this.fail("Speech took too long. Please try again.");
    }, 65_000);
    this.timers.add(timer);
    try {
      const response = await this.deps.fetch("/api/speech/", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      if (!current()) return null;
      if (!response.ok) throw new Error("speech_response");
      if (response.headers.get("content-type")?.split(";")[0] !== "audio/mpeg") throw new Error("speech_type");
      const blob = await response.blob();
      if (!current()) return null;
      if (!blob.size || blob.size > 1024 * 1024) throw new Error("speech_size");
      return blob;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      this.timers.delete(timer);
      this.controllers.delete(controller);
    }
  }

  private async advance() {
    if (this.advancing || this.audio) return;
    this.prefetch();
    const prepared = this.prepared;
    if (!prepared) {
      if (!this.streamOpen) this.reply = null;
      this.onState({ ...IDLE, loading: this.streamOpen });
      return;
    }
    const epoch = this.epoch;
    const current = () => epoch === this.epoch;
    this.advancing = true;
    this.onState({ loading: true, isSpeaking: false, error: null });
    const blob = await prepared.promise;
    if (!current()) return;
    this.advancing = false;
    this.prepared = null;
    if (!blob) {
      this.fail("Speech is unavailable or playback was blocked. Please try again.");
      return;
    }
    try {
      this.url = this.deps.createUrl(blob);
      const audio = this.deps.createAudio(this.url);
      this.audio = audio;
      const currentAudio = () => current() && this.audio === audio;
      audio.onplaying = () => {
        if (currentAudio()) this.onState({ loading: false, isSpeaking: true, error: null });
      };
      audio.onpause = () => {
        if (currentAudio()) this.onState({ ...IDLE });
      };
      audio.onended = () => {
        if (!currentAudio()) return;
        this.releaseAudio();
        void this.advance();
      };
      audio.onerror = () => {
        if (currentAudio()) this.fail("Audio could not be played. Please try again.");
      };
      await audio.play();
      // A stale play promise can finish after stop; never resurrect feedback.
      if (!currentAudio()) audio.pause();
      else this.prefetch();
    } catch {
      if (!current()) return;
      this.fail("Speech is unavailable or playback was blocked. Please try again.");
    }
  }
}
