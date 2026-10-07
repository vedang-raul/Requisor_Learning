"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Volume2 } from "lucide-react";
import type { PublicSpeechVoice } from "@/lib/speech-types";

interface Props {
  voices: PublicSpeechVoice[];
  selectedVoiceKey: string;
  onSelectVoice: (key: string) => void;
}

interface MenuPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

function getLanguageLabel(languages: string[]) {
  return languages
    .map((language) => {
      try {
        return languageNames.of(language) ?? language;
      } catch {
        return language;
      }
    })
    .join(", ");
}

function getVoiceLabel(voice: PublicSpeechVoice) {
  return `${voice.name}, ${getLanguageLabel(voice.languages)}, ${voice.gender}`;
}

export function ChatbotVoiceSelect({ voices, selectedVoiceKey, onSelectVoice }: Props) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const typeaheadRef = useRef("");
  const typeaheadTimer = useRef<number | null>(null);
  const listboxId = useId();
  const selected = voices.find((voice) => voice.key === selectedVoiceKey);
  const enabledVoices = useMemo(() => voices.filter((voice) => voice.enabled), [voices]);
  const hasEnabledVoices = enabledVoices.length > 0;

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(320, viewportWidth - 24);
    const left = Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12));
    const below = viewportHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const placeBelow = below >= Math.min(280, above) || below >= above;
    const available = Math.max(150, placeBelow ? below : above);
    const maxHeight = Math.min(380, available, viewportHeight * 0.68);
    const top = placeBelow
      ? Math.min(rect.bottom + 8, viewportHeight - maxHeight - 12)
      : Math.max(12, rect.top - maxHeight - 8);

    setPosition({ left, top, width, maxHeight });
  }, []);

  const focusVoice = useCallback((index: number) => {
    const voice = enabledVoices[index];
    if (voice) {
      setActiveIndex(index);
      optionRefs.current[voice.key]?.focus();
    }
  }, [enabledVoices]);

  const openMenu = useCallback((initialIndex?: number) => {
    if (!hasEnabledVoices) return;
    const selectedIndex = enabledVoices.findIndex((voice) => voice.key === selectedVoiceKey);
    setActiveIndex(initialIndex ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  }, [enabledVoices, hasEnabledVoices, selectedVoiceKey]);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePosition();

    const onOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", onOutsidePointer);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", onOutsidePointer);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || !position) return;
    const active = enabledVoices[activeIndex] ?? enabledVoices[0];
    const option = active ? optionRefs.current[active.key] : null;
    if (option && document.activeElement !== option) option.focus();
  }, [activeIndex, enabledVoices, open, position]);

  useEffect(() => () => {
    if (typeaheadTimer.current !== null) window.clearTimeout(typeaheadTimer.current);
  }, []);

  const selectVoice = (voice: PublicSpeechVoice) => {
    if (!voice.enabled) return;
    onSelectVoice(voice.key);
    closeMenu(true);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" ? enabledVoices.length - 1 : undefined);
    } else if (event.key === "Home" && hasEnabledVoices) {
      event.preventDefault();
      openMenu(0);
    } else if (event.key === "End" && hasEnabledVoices) {
      event.preventDefault();
      openMenu(enabledVoices.length - 1);
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, voice: PublicSpeechVoice) => {
    const currentIndex = enabledVoices.findIndex((item) => item.key === voice.key);
    if (event.key === "Tab") {
      closeMenu(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      focusVoice((currentIndex + direction + enabledVoices.length) % enabledVoices.length);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusVoice(event.key === "Home" ? 0 : enabledVoices.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectVoice(voice);
      return;
    }
    if (event.key.length === 1 && event.key !== " ") {
      typeaheadRef.current += event.key.toLocaleLowerCase();
      if (typeaheadTimer.current !== null) window.clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = window.setTimeout(() => {
        typeaheadRef.current = "";
        typeaheadTimer.current = null;
      }, 650);
      const searchStart = currentIndex + 1;
      const ordered = [...enabledVoices.slice(searchStart), ...enabledVoices.slice(0, searchStart)];
      const match = ordered.findIndex((item) => item.name.toLocaleLowerCase().startsWith(typeaheadRef.current));
      if (match >= 0) focusVoice((searchStart + match) % enabledVoices.length);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={selected ? `Chatbot voice: ${getVoiceLabel(selected)}` : "Choose chatbot voice"}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        title={selected ? `Chatbot voice: ${getVoiceLabel(selected)}` : "Choose chatbot voice"}
        disabled={!hasEnabledVoices}
        data-chatbot-voice-dropdown=""
        data-open={open ? "true" : "false"}
        onClick={() => (open ? closeMenu(false) : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        className="focus-ring ml-1 flex h-10 w-[112px] min-w-0 max-w-[38vw] items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2 text-left text-xs text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[132px]"
      >
        <Volume2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-teal-700" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {selected?.name ?? (voices.length ? "Choose voice" : "No voices")}
        </span>
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && position && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          aria-label="Available chatbot voices"
          data-chatbot-voice-dropdown=""
          data-open="true"
          style={{
            position: "fixed",
            left: position.left,
            top: position.top,
            width: position.width,
            maxHeight: position.maxHeight,
            zIndex: 100,
          }}
          className="overflow-y-auto overscroll-contain rounded-xl border border-teal-900/10 bg-[#fffefa] p-1.5 shadow-[0_14px_40px_-14px_rgba(28,52,54,0.35)] ring-1 ring-black/[0.03]"
        >
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
            Choose a speaking voice
          </div>
          {voices.map((voice) => {
            const isSelected = voice.key === selectedVoiceKey;
            const languages = getLanguageLabel(voice.languages);
            return (
              <button
                key={voice.key}
                ref={(element) => { optionRefs.current[voice.key] = element; }}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={!voice.enabled}
                disabled={!voice.enabled}
                onClick={() => selectVoice(voice)}
                onKeyDown={(event) => handleOptionKeyDown(event, voice)}
                tabIndex={-1}
                className={`focus-ring group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  !voice.enabled
                    ? "cursor-not-allowed opacity-50"
                    : isSelected
                      ? "bg-teal-50 text-teal-950"
                      : "text-zinc-700 hover:bg-[#f3f5f1] focus:bg-[#f3f5f1]"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isSelected ? "bg-teal-100 text-teal-800" : "bg-zinc-100 text-zinc-500"
                }`}>
                  {isSelected
                    ? <Check aria-hidden="true" className="h-3.5 w-3.5" />
                    : <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold leading-4">{voice.name}</span>
                    {voice.default && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-amber-800">
                        Default
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] capitalize leading-4 text-zinc-500">
                    {languages} · {voice.gender}
                    {!voice.enabled && ` · ${voice.unavailableReason || "Unavailable"}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
