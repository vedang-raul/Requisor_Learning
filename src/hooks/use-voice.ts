"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

// Browser type declarations for Web Speech API (not in standard TS lib)
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionResultEvt) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
}
interface SpeechRecognitionResultEvt extends Event {
  readonly results: SpeechRecognitionResultList;
}
declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognitionInstance };
    webkitSpeechRecognition: { new (): SpeechRecognitionInstance };
  }
}

const VOICE_STORAGE_KEY = "requisor-tts-voice";
const CHARACTER_STORAGE_KEY = "requisor-tts-character";
export type VoiceCharacter = { key: string; name: string; description?: string };

export interface UseVoiceReturn {
  isListening: boolean;
  isSpeaking: boolean;
  transcript: string;
  sttSupported: boolean;
  ttsSupported: boolean;
  /** True when replies are spoken by the server's ElevenLabs voice rather than the browser's. */
  premiumVoice: boolean;
  /** The ElevenLabs characters the learner can choose between (empty without a premium voice). */
  characters: VoiceCharacter[];
  selectedCharacter: string;
  setSelectedCharacter: (key: string) => void;
  voices: SpeechSynthesisVoice[];
  selectedVoiceName: string;
  setSelectedVoiceName: (name: string) => void;
  startListening: () => void;
  stopListening: () => void;
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceNameState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(VOICE_STORAGE_KEY) ?? "";
  });

  // Determine support (safe for SSR)
  const sttSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const browserTts =
    typeof window !== "undefined" && !!window.speechSynthesis;
  // The server's ElevenLabs voice, when one is set up. The browser's voice stays as the fallback.
  const [premiumVoice, setPremiumVoice] = useState(false);
  const ttsSupported = browserTts || premiumVoice;
  const [characters, setCharacters] = useState<VoiceCharacter[]>([]);
  const [storedCharacter, setStoredCharacter] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem(CHARACTER_STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  // A saved choice that no longer exists falls back to the first character.
  const selectedCharacter = characters.some((c) => c.key === storedCharacter) ? storedCharacter : characters[0]?.key ?? "";
  const setSelectedCharacter = useCallback((key: string) => {
    setStoredCharacter(key);
    try { localStorage.setItem(CHARACTER_STORAGE_KEY, key); } catch { /* private window */ }
  }, []);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
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

  // Initialise recognition once
  useEffect(() => {
    if (!sttSupported) return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognitionCtor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onresult = (event: SpeechRecognitionResultEvt) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        setTranscript(result[0].transcript);
      }
    };

    rec.onend = () => {
      setIsListening(false);
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    };
  }, [sttSupported]);

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

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    setTranscript("");
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // already started or other error
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    setIsListening(false);
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
    sttSupported,
    ttsSupported,
    premiumVoice,
    characters,
    selectedCharacter,
    setSelectedCharacter,
    voices,
    selectedVoiceName,
    setSelectedVoiceName,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    beginSpeech,
    queueSpeech,
    speechStartedRef,
  };
}
