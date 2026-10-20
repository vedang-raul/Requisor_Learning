"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { livePreview, micErrorMessage } from "@/lib/ai/stt";

/**
 * Voice input records the microphone and has the server transcribe it; the
 * browser's own speech recognition is not used. Recording stops by itself once
 * the person has finished speaking.
 */
/** Input level (0..1) above which the microphone is hearing a voice rather than the room. */
const SPEECH_LEVEL = 0.015;
/** A pause this long after speaking ends the recording. */
const PAUSE_ENDS_AFTER_MS = 1800;
/** Nothing said for this long ends the recording. */
const NO_SPEECH_AFTER_MS = 8000;
const MAX_RECORDING_MS = 60_000;
const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * The browser's own speech recognition, where it exists. It is used only to
 * show the words while the person is speaking; the text that gets sent always
 * comes from the server's transcription of the recording.
 */
type LivePreview = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  abort(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
function createLivePreview(): LivePreview | null {
  const w = window as unknown as { SpeechRecognition?: new () => LivePreview; webkitSpeechRecognition?: new () => LivePreview };
  const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Recognition) return null;
  try { return new Recognition(); } catch { return null; }
}

type ListenSession = {
  /** Set once the session is over, so late callbacks do nothing. */
  ended: boolean;
  /** The recording is thrown away instead of transcribed. */
  discard: boolean;
  heardSpeech: boolean;
  /** It ended by itself because nothing was said. */
  silent: boolean;
  stream: MediaStream | null;
  recorder: MediaRecorder | null;
  context: AudioContext | null;
  timer: ReturnType<typeof setInterval> | null;
  preview: LivePreview | null;
  chunks: Blob[];
};

function releaseSession(session: ListenSession) {
  if (session.timer) clearInterval(session.timer);
  session.timer = null;
  if (session.preview) {
    session.preview.onresult = null;
    try { session.preview.abort(); } catch { /* already stopped */ }
    session.preview = null;
  }
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
  session.context?.close().catch(() => {});
  session.context = null;
}

const VOICE_STORAGE_KEY = "requisor-tts-voice";
const CHARACTER_STORAGE_KEY = "requisor-tts-character";
export type VoiceCharacter = { key: string; name: string; description?: string };

export interface UseVoiceReturn {
  isListening: boolean;
  isSpeaking: boolean;
  /** What the person said in the last recording, once it has been transcribed. */
  transcript: string;
  /** While recording: the words heard so far, where the browser can show them. A preview only; "" otherwise. */
  liveTranscript: string;
  /** The recording has ended and its words are being worked out. */
  isTranscribing: boolean;
  /** Why voice input gave nothing, in plain words; "" otherwise. */
  listenError: string;
  sttSupported: boolean;
  ttsSupported: boolean;
  /** True when replies are spoken by the server's ElevenLabs voice rather than the browser's. */
  premiumVoice: boolean;
  /** The ElevenLabs characters the learner can choose between (empty without a premium voice). */
  characters: VoiceCharacter[];
  selectedCharacter: string;
  setSelectedCharacter: (key: string) => void;
  /** Whether the person picked a voice themselves (vs. the automatic default). */
  characterChosen: boolean;
  /** The voice to use while they haven't picked one; not saved. */
  setDefaultCharacter: (key: string) => void;
  voices: SpeechSynthesisVoice[];
  selectedVoiceName: string;
  setSelectedVoiceName: (name: string) => void;
  startListening: () => void;
  /** Ends the recording and transcribes it. */
  stopListening: () => void;
  /** Ends the recording and throws it away. */
  cancelListening: () => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  /**
   * Speaking a reply while it is still being written: call beginSpeech once, then
   * queueSpeech with each finished passage. Passages are fetched straight away
   * and played in order, so the voice starts after the first sentence, not after
   * the whole reply.
   */
  beginSpeech: () => void;
  queueSpeech: (text: string) => void;
  /** True once the current reply's voice has actually started (or given up), so the text can appear with it. */
  speechStartedRef: MutableRefObject<boolean>;
}

export function useVoice(): UseVoiceReturn {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [listenError, setListenError] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceNameState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(VOICE_STORAGE_KEY) ?? "";
  });

  // Determine support (safe for SSR)
  const canRecord =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";
  const browserTts =
    typeof window !== "undefined" && !!window.speechSynthesis;
  // The server's ElevenLabs voice, when one is set up. The browser's voice stays as the fallback.
  const [premiumVoice, setPremiumVoice] = useState(false);
  const ttsSupported = browserTts || premiumVoice;
  // Transcription runs on the server with the same key as the voice.
  const sttSupported = canRecord && premiumVoice;
  const [characters, setCharacters] = useState<VoiceCharacter[]>([]);
  const [storedCharacter, setStoredCharacter] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem(CHARACTER_STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  // Used until the person picks a voice themselves (e.g. one that speaks their
  // chosen language). Not saved, so it can follow a later language change.
  const [defaultCharacter, setDefaultCharacter] = useState("");
  const characterChosen = characters.some((c) => c.key === storedCharacter);
  // A saved choice that no longer exists falls back to the default, then the first character.
  const selectedCharacter = characterChosen
    ? storedCharacter
    : characters.some((c) => c.key === defaultCharacter) ? defaultCharacter : characters[0]?.key ?? "";
  const setSelectedCharacter = useCallback((key: string) => {
    setStoredCharacter(key);
    try { localStorage.setItem(CHARACTER_STORAGE_KEY, key); } catch { /* private window */ }
  }, []);

  const sessionRef = useRef<ListenSession | null>(null);
  // Counts recordings, so a transcript that arrives after a newer one (or a cancel) is dropped.
  const listenTurnRef = useRef(0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  // Counts speak/stop calls, so audio that arrives after a newer call is dropped.
  const speakTurnRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tts/")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean; voices?: VoiceCharacter[] } | null) => {
        if (cancelled || !data?.enabled) return;
        setPremiumVoice(true);
        if (Array.isArray(data.voices)) setCharacters(data.voices.filter((v) => typeof v?.key === "string" && typeof v?.name === "string"));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Load voices — browsers fire voiceschanged once the list is ready
  useEffect(() => {
    if (!browserTts) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) setVoices(v);
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [browserTts]);

  const setSelectedVoiceName = useCallback((name: string) => {
    setSelectedVoiceNameState(name);
    if (typeof window !== "undefined") {
      localStorage.setItem(VOICE_STORAGE_KEY, name);
    }
  }, []);

  // Stop speech synthesis on unmount
  useEffect(() => {
    return () => {
      speakTurnRef.current++;
      stopAudio();
      if (browserTts) {
        window.speechSynthesis.cancel();
      }
    };
  }, [browserTts, stopAudio]);

  const transcribe = useCallback((recording: Blob) => {
    const turn = ++listenTurnRef.current;
    setIsTranscribing(true);
    fetch("/api/stt/", { method: "POST", headers: { "Content-Type": recording.type || "audio/webm" }, body: recording })
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "");
        return typeof data?.text === "string" ? data.text.trim() : "";
      })
      .then((text) => {
        if (turn !== listenTurnRef.current) return;
        if (text) setTranscript(text);
        else setListenError("I couldn't make out any words. Try again, a little closer to the microphone.");
      })
      .catch((error: Error) => {
        if (turn !== listenTurnRef.current) return;
        setListenError(error.message || "Voice input couldn't be transcribed. Check your connection and try again.");
      })
      .finally(() => { if (turn === listenTurnRef.current) setIsTranscribing(false); });
  }, []);

  /** Ends the recording. Unless it is discarded, what was recorded goes off to be transcribed. */
  const endListening = useCallback((discard: boolean) => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    session.ended = true;
    session.discard = discard;
    setIsListening(false);
    if (session.recorder && session.recorder.state !== "inactive") {
      // The recorder's "stop" handler picks it up from here.
      try { session.recorder.stop(); return; } catch { /* fall through and release */ }
    }
    releaseSession(session);
  }, []);

  const startListening = useCallback(() => {
    if (!canRecord || sessionRef.current) return;
    listenTurnRef.current++;
    setIsTranscribing(false);
    setTranscript("");
    setLiveTranscript("");
    setListenError("");
    const session: ListenSession = { ended: false, discard: false, heardSpeech: false, silent: false, stream: null, recorder: null, context: null, timer: null, preview: null, chunks: [] };
    sessionRef.current = session;
    setIsListening(true);

    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      .then((stream) => {
        if (session.ended) { stream.getTracks().forEach((track) => track.stop()); return; }
        session.stream = stream;
        const type = RECORDING_TYPES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
        const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32_000 } : undefined);
        session.recorder = recorder;
        recorder.ondataavailable = (event) => { if (event.data.size) session.chunks.push(event.data); };
        recorder.onstop = () => {
          releaseSession(session);
          if (session.discard) return;
          if (session.silent) { setListenError("I didn't hear anything. Tap the microphone and try again."); return; }
          const recording = new Blob(session.chunks, { type: recorder.mimeType || type || "audio/webm" });
          if (recording.size) transcribe(recording);
        };
        recorder.start(250);

        // The words as they are spoken. If the browser can't do this, the recording carries on without it.
        const preview = createLivePreview();
        if (preview) {
          session.preview = preview;
          preview.continuous = true;
          preview.interimResults = true;
          preview.lang = navigator.language || "en-US";
          preview.onresult = (event) => {
            if (session.ended) return;
            const pieces: string[] = [];
            for (let i = 0; i < event.results.length; i++) pieces.push(event.results[i][0]?.transcript ?? "");
            setLiveTranscript(livePreview(pieces));
          };
          preview.onerror = () => {};
          preview.onend = () => {};
          try { preview.start(); } catch { session.preview = null; }
        }

        // Watches the input level so the recording ends when the person stops talking.
        let level: (() => number) | null = null;
        try {
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const context = new AC();
          session.context = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          context.createMediaStreamSource(stream).connect(analyser);
          const samples = new Uint8Array(analyser.fftSize);
          level = () => {
            analyser.getByteTimeDomainData(samples);
            let sum = 0;
            for (let i = 0; i < samples.length; i++) { const v = (samples[i] - 128) / 128; sum += v * v; }
            return Math.sqrt(sum / samples.length);
          };
        } catch { /* without a level meter the person ends the recording by tapping */ }

        const startedAt = Date.now();
        let lastVoiceAt = startedAt;
        session.timer = setInterval(() => {
          if (session.ended) return;
          const now = Date.now();
          if (level && level() > SPEECH_LEVEL) { session.heardSpeech = true; lastVoiceAt = now; }
          if (now - startedAt > MAX_RECORDING_MS) endListening(false);
          else if (!level) return;
          else if (session.heardSpeech && now - lastVoiceAt > PAUSE_ENDS_AFTER_MS) endListening(false);
          else if (!session.heardSpeech && now - startedAt > NO_SPEECH_AFTER_MS) { session.silent = true; endListening(false); }
        }, 100);
      })
      .catch((error: { name?: string } | null) => {
        if (session.ended) return;
        sessionRef.current = null;
        session.ended = true;
        releaseSession(session);
        setIsListening(false);
        setListenError(micErrorMessage(error?.name));
      });
  }, [canRecord, endListening, transcribe]);

  const stopListening = useCallback(() => endListening(false), [endListening]);

  const cancelListening = useCallback(() => {
    endListening(true);
    listenTurnRef.current++;
    setIsTranscribing(false);
    setListenError("");
  }, [endListening]);

  // Leaving the page ends any recording without sending it.
  useEffect(() => () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    session.ended = true;
    session.discard = true;
    try { if (session.recorder && session.recorder.state !== "inactive") session.recorder.stop(); } catch { /* already stopped */ }
    releaseSession(session);
  }, []);

  const speakWithBrowser = useCallback(
    (text: string) => {
      if (!browserTts || !text.trim()) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1;

      // Apply selected voice if set
      if (selectedVoiceName) {
        const match = window.speechSynthesis
          .getVoices()
          .find((v) => v.name === selectedVoiceName);
        if (match) utterance.voice = match;
      }

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [browserTts, selectedVoiceName]
  );

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const turn = ++speakTurnRef.current;
      stopAudio();
      if (browserTts) window.speechSynthesis.cancel();
      if (!premiumVoice) { speakWithBrowser(text); return; }

      // Anything that goes wrong (no credits, network, autoplay blocked) falls back to the browser's voice.
      const fallBack = () => { if (turn === speakTurnRef.current) { stopAudio(); setIsSpeaking(false); speakWithBrowser(text); } };
      setIsSpeaking(true);
      fetch("/api/tts/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: selectedCharacter }) })
        .then((res) => { if (!res.ok) throw new Error("tts"); return res.blob(); })
        .then((blob) => {
          if (turn !== speakTurnRef.current) return;
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;
          audioUrlRef.current = url;
          audio.onended = () => { if (turn === speakTurnRef.current) { stopAudio(); setIsSpeaking(false); } };
          audio.onerror = fallBack;
          return audio.play();
        })
        .catch(fallBack);
    },
    [browserTts, premiumVoice, selectedCharacter, speakWithBrowser, stopAudio]
  );

  // ── A reply spoken passage by passage, as it streams in ────────────────────
  const speechQueueRef = useRef<{ text: string; audio: Promise<Blob | null> }[]>([]);
  const queuePlayingRef = useRef(false);
  const speechStartedRef = useRef(false);

  const stopSpeaking = useCallback(() => {
    speakTurnRef.current++;
    speechQueueRef.current = [];
    queuePlayingRef.current = false;
    speechStartedRef.current = true;
    stopAudio();
    if (browserTts) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [browserTts, stopAudio]);

  const beginSpeech = useCallback(() => {
    speakTurnRef.current++;
    speechQueueRef.current = [];
    queuePlayingRef.current = false;
    speechStartedRef.current = false;
    stopAudio();
    if (browserTts) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [browserTts, stopAudio]);

  /** The browser's own voice queues by itself: each utterance waits for the one before. */
  const queueWithBrowser = useCallback(
    (text: string, turn: number) => {
      speechStartedRef.current = true;
      if (!browserTts) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      const match = selectedVoiceName ? window.speechSynthesis.getVoices().find((v) => v.name === selectedVoiceName) : undefined;
      if (match) utterance.voice = match;
      utterance.onstart = () => { if (turn === speakTurnRef.current) setIsSpeaking(true); };
      utterance.onend = utterance.onerror = () => { if (turn === speakTurnRef.current && !window.speechSynthesis.pending) setIsSpeaking(false); };
      window.speechSynthesis.speak(utterance);
    },
    [browserTts, selectedVoiceName]
  );

  const playQueued = useCallback(
    (turn: number) => {
      if (turn !== speakTurnRef.current || queuePlayingRef.current) return;
      const next = speechQueueRef.current.shift();
      if (!next) { setIsSpeaking(false); return; }
      queuePlayingRef.current = true;
      const advance = () => {
        if (turn !== speakTurnRef.current) return;
        stopAudio();
        queuePlayingRef.current = false;
        playQueued(turn);
      };
      void next.audio.then((blob) => {
        if (turn !== speakTurnRef.current) return;
        // No audio for this passage (out of credits, network, rate limit): say it with the browser's voice instead.
        if (!blob) { queueWithBrowser(next.text, turn); advance(); return; }
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        audioUrlRef.current = url;
        audio.onplaying = () => { speechStartedRef.current = true; setIsSpeaking(true); };
        audio.onended = advance;
        audio.onerror = () => { queueWithBrowser(next.text, turn); advance(); };
        audio.play().catch(() => { queueWithBrowser(next.text, turn); advance(); });
      });
    },
    [queueWithBrowser, stopAudio]
  );

  const queueSpeech = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const turn = speakTurnRef.current;
      if (!premiumVoice) { queueWithBrowser(text, turn); return; }
      // Fetched now, played in turn: later passages are ready by the time the earlier ones finish.
      const audio = fetch("/api/tts/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice: selectedCharacter }) })
        .then((res) => (res.ok ? res.blob() : null))
        .catch(() => null);
      speechQueueRef.current.push({ text, audio });
      playQueued(turn);
    },
    [premiumVoice, selectedCharacter, queueWithBrowser, playQueued]
  );

  return {
    isListening,
    isSpeaking,
    transcript,
    liveTranscript,
    isTranscribing,
    listenError,
    sttSupported,
    ttsSupported,
    premiumVoice,
    characters,
    selectedCharacter,
    setSelectedCharacter,
    characterChosen,
    setDefaultCharacter,
    voices,
    selectedVoiceName,
    setSelectedVoiceName,
    startListening,
    stopListening,
    cancelListening,
    speak,
    stopSpeaking,
    beginSpeech,
    queueSpeech,
    speechStartedRef,
  };
}
