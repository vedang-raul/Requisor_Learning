"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpeechPlayer, type SpeechPlaybackState } from "@/lib/speech-player";
import { readSpeechPreferences, writeSpeechPreferences } from "@/lib/speech-preferences";
import type { ApprovedSpeechKey, SpeechCatalogResponse, PublicSpeechVoice } from "@/lib/speech-types";

export function useApprovedSpeech(accountId: string | null) {
  const [catalog, setCatalog] = useState<SpeechCatalogResponse>({ voices: [], setupMessage: null });
  const [selectedVoiceKey, setSelectedVoiceKey] = useState("");
  const [muted, setMutedState] = useState(false);
  const [playback, setPlayback] = useState<SpeechPlaybackState>({ loading: false, isSpeaking: false, error: null });
  const player = useRef<SpeechPlayer | null>(null);
  const owner = useRef<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const prefs = useRef({ voiceKey: "", muted: false });
  // This render-time guard rejects callbacks belonging to an old account before effects run.
  owner.current = accountId;
  if (!player.current) {
    player.current = new SpeechPlayer({
      fetch: (...args) => fetch(...args),
      createAudio: url => new Audio(url),
      createUrl: blob => URL.createObjectURL(blob),
      revokeUrl: url => URL.revokeObjectURL(url),
    }, setPlayback);
  }
  const stop = useCallback(() => player.current?.stop(), []);

  useEffect(() => {
    stop();
    loadedFor.current = null;
    setCatalog({ voices: [], setupMessage: null });
    setSelectedVoiceKey("");
    setMutedState(false);
    prefs.current = { voiceKey: "", muted: false };
    if (!accountId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let stored = null;
    try { stored = readSpeechPreferences(localStorage, accountId); } catch { /* Access to storage itself may be blocked. */ }
    if (stored) {
      prefs.current = stored;
      setMutedState(stored.muted);
    }
    fetch("/api/speech/", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw new Error("catalog");
        const result: SpeechCatalogResponse = await r.json();
        if (controller.signal.aborted || owner.current !== accountId) return;
        if (!Array.isArray(result.voices)) throw new Error("catalog_shape");
        setCatalog(result);
        const chosen = result.voices.find(v => v.key === stored?.voiceKey && v.enabled)
          ?? result.voices.find(v => v.default && v.enabled)
          ?? result.voices.find(v => v.enabled)
          ?? result.voices.find(v => v.default);
        prefs.current = { voiceKey: chosen?.key ?? "", muted: stored?.muted ?? false };
        loadedFor.current = accountId;
        setSelectedVoiceKey(prefs.current.voiceKey);
      })
      .catch(() => {
        if (owner.current !== accountId) return;
        setCatalog({ voices: [], setupMessage: "Voice options could not be loaded. Reopen chat or reload to try again." });
      })
      .finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(timeout); stop(); };
  }, [accountId, stop]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", hide);
      stop();
    };
  }, [stop]);

  const save = useCallback(() => {
    if (accountId && loadedFor.current === accountId && owner.current === accountId) {
      try { writeSpeechPreferences(localStorage, accountId, prefs.current); } catch { /* Storage unavailable. */ }
    }
  }, [accountId]);
  const selectVoice = useCallback((key: string) => {
    stop();
    if (owner.current !== accountId || loadedFor.current !== accountId || !catalog.voices.some(v => v.key === key && v.enabled)) return;
    prefs.current.voiceKey = key;
    setSelectedVoiceKey(key);
    save();
  }, [accountId, catalog.voices, save, stop]);
  const setMuted = useCallback((value: boolean) => {
    stop();
    if (!accountId || owner.current !== accountId || loadedFor.current !== accountId) return;
    prefs.current.muted = value;
    setMutedState(value);
    save();
  }, [accountId, save, stop]);
  const play = useCallback(async (contentKey: ApprovedSpeechKey, voiceKey = prefs.current.voiceKey) => {
    if (!accountId || owner.current !== accountId || loadedFor.current !== accountId || prefs.current.muted
      || !catalog.voices.some(v => v.key === voiceKey && v.enabled)) return;
    await player.current?.play(contentKey, voiceKey);
  }, [accountId, catalog.voices]);
  const speak = useCallback(async (text: string) => {
    if (!accountId || owner.current !== accountId || loadedFor.current !== accountId || prefs.current.muted
      || !catalog.voices.some(v => v.key === prefs.current.voiceKey && v.enabled)) return;
    await player.current?.speak(text, prefs.current.voiceKey);
  }, [accountId, catalog.voices]);

  const ready = owner.current === loadedFor.current && !!accountId;
  return {
    voices: (ready ? catalog.voices : []) as PublicSpeechVoice[],
    selectedVoiceKey: ready ? selectedVoiceKey : "",
    muted: ready ? muted : false,
    loading: ready && playback.loading,
    isSpeaking: ready && playback.isSpeaking,
    error: ready ? playback.error : null,
    setupMessage: catalog.setupMessage,
    canSpeak: ready && !muted && catalog.voices.some(v => v.key === selectedVoiceKey && v.enabled),
    selectVoice, setMuted, play, speak, stop,
  };
}
