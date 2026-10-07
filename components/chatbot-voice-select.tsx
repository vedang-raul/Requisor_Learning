"use client";

import React from "react";
import type { PublicSpeechVoice } from "@/lib/speech-types";

interface Props {
  voices: PublicSpeechVoice[];
  selectedVoiceKey: string;
  onSelectVoice: (key: string) => void;
}

export function ChatbotVoiceSelect({ voices, selectedVoiceKey, onSelectVoice }: Props) {
  const selected = voices.find(voice => voice.key === selectedVoiceKey);
  return (
    <select
      aria-label="Chatbot voice"
      title={selected ? `Chatbot voice: ${selected.name}` : "Choose chatbot voice"}
      value={selectedVoiceKey}
      disabled={!voices.some(voice => voice.enabled)}
      onChange={event => {
        const key = event.target.value;
        if (voices.some(voice => voice.key === key && voice.enabled)) onSelectVoice(key);
      }}
      className="focus-ring ml-1 min-h-10 w-28 min-w-0 max-w-[32vw] rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-32"
    >
      {!selected && <option value="" disabled>{voices.length ? "Choose voice" : "No voices"}</option>}
      {voices.map(voice => (
        <option key={voice.key} value={voice.key} disabled={!voice.enabled}>
          {voice.name}{voice.default ? " (default)" : ""}{!voice.enabled ? " — unavailable" : ""}
        </option>
      ))}
    </select>
  );
}
