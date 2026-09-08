"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookPlus, Check, Compass, ListChecks, Loader2, RotateCcw, Send, Sparkles, TrendingUp, Volume2, VolumeX, X, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { getNudge, markNudgeSeen, type Nudge } from "@/lib/nudges";
import { cn } from "@/lib/utils";
import { renderMarkdownLite, endsInOpenTag } from "@/components/markdown-lite";
import { useVoice } from "@/hooks/use-voice";
import { PersonaAvatar } from "@/components/persona-avatar";
import { AI_GUIDE_PREFERENCES_UPDATED, getPersona } from "@/lib/personas";
import { trackEvent } from "@/lib/analytics";
import type { Course } from "@/lib/types";
type ChatMessage = { role: "user" | "assistant"; content: string };
const LEARNER_QUICK_PROMPTS = [
  { icon: Compass, label: "Recommend a course for my background" },
  { icon: Compass, label: "What should I learn next?" },
  { icon: ListChecks, label: "Summarize my progress" },
  { icon: TrendingUp, label: "How am I doing overall?" },
];
const TUTOR_QUICK_PROMPTS = [
  { icon: Sparkles, label: "Design a course from my topic" },
  { icon: ListChecks, label: "Suggest modules and lessons" },
  { icon: Compass, label: "Improve my course structure" },
  { icon: TrendingUp, label: "Create activities and assessments" },
];
/** Best-effort match from a preferred language code to a Web Speech voice lang prefix. */
const LANGUAGE_VOICE_PREFIXES: Record<string, string[]> = {
  en: ["en-US", "en-"],
  es: ["es-"],
  fr: ["fr-"],
  de: ["de-"],
  pt: ["pt-BR", "pt-"],
  hi: ["hi-", "en-IN"],
  ar: ["ar-"],
  zh: ["zh-CN", "zh-"],
  ja: ["ja-"],
  ko: ["ko-"],
  it: ["it-"],
  nl: ["nl-"],
  ru: ["ru-"],
  pl: ["pl-"],
  id: ["id-"],
};
const dotTransition = (delay: number) => ({
  duration: 0.9,
  repeat: Infinity,
  ease: [0.45, 0, 0.55, 1] as const,
  delay,
});
function TypingDots() {
  return (
    <span className="flex items-center gap-1 px-1 py-2">
      {[0, 0.15, 0.3].map((delay, i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary to-secondary"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={dotTransition(delay)}
        />
      ))}
    </span>
  );
}
function StreamCursor() {
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-3.5 w-[3px] rounded-full bg-gradient-to-b from-primary to-secondary align-middle"
      animate={{ opacity: [1, 1, 0, 0] }}
      transition={{ duration: 0.9, repeat: Infinity, times: [0, 0.5, 0.5, 1] }}
      style={{ boxShadow: "0 0 6px rgba(0,0,0,0.15)" }}
    />
  );
}
/**
 * Live mic waveform (Claude-style dictation).
 * While `active`, opens an AnalyserNode on the mic stream and samples the real
 * input level ~18×/s. Each sample is pushed onto a rolling buffer, so the bars
 * scroll left as you speak — exactly like Claude's recording animation.
 * Falls back to a gentle synthetic pulse if the audio stream can't be opened
 * (e.g. permission granted to SpeechRecognition but AudioContext blocked).
 */
function useMicWaveform(active: boolean, barCount = 28) {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: barCount }, () => 0.06));
  useEffect(() => {
    if (!active) {
      setBars(Array.from({ length: barCount }, () => 0.06));
      return;
    }
    let cancelled = false;
    let raf: number | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let lastPush = 0;

    const push = (level: number) =>
      setBars((prev) => [...prev.slice(1), Math.min(1, Math.max(0.06, level))]);

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = (now: number) => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          if (now - lastPush > 55) {
            lastPush = now;
            push(rms * 4.5); // scale RMS into a visible 0..1 range
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (cancelled) return;
        fallback = setInterval(() => push(0.12 + Math.random() * 0.35), 90);
      });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (fallback) clearInterval(fallback);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [active, barCount]);
  return bars;
}
/** The scrolling bar strip rendered while recording. */
function RecordingWaveform({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-9 min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden px-1">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-[3px] shrink-0 rounded-full bg-gradient-to-b from-primary to-secondary transition-[height] duration-100 ease-out"
          style={{ height: `${Math.max(4, Math.round(h * 28))}px`, opacity: 0.45 + h * 0.55 }}
        />
      ))}
    </div>
  );
}
/** Strip {{course|...}} / {{lesson|...}} tags and markdown symbols for clean TTS text. */
function stripForSpeech(text: string): string {
  return text
    // Replace lesson tags with just the lesson title
    .replace(/\{\{lesson\|[^|]+\|([^}]+)\}\}/g, "$1")
    // Replace course tags with just the course title
    .replace(/\{\{course\|[^|]+\|([^}]+)\}\}/g, "$1")
    // Strip bold / italic markers
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    // Strip markdown headings
    .replace(/^#{1,6}\s/gm, "")
    // Collapse excess whitespace
    .replace(/\s+/g, " ")
    .trim();
}
/** Extract the first navigable URL from a message. Returns null if none found. */
function extractFirstNavUrl(
  text: string,
  resolveLesson: (courseTitle: string, lessonTitle: string) => string | null
): string | null {
  // Check lesson tags first
  const lessonMatch = /\{\{lesson\|([^|]+)\|([^}]+)\}\}/.exec(text);
  if (lessonMatch) {
    const url = resolveLesson(lessonMatch[1].trim(), lessonMatch[2].trim());
    if (url) return url;
  }
  // Then course tags
  const courseMatch = /\{\{course\|([^|]+)\|([^}]+)\}\}/.exec(text);
  if (courseMatch) {
    const slug = courseMatch[1].trim();
    if (slug) return `/app/course/?slug=${slug}`;
  }
  return null;
}
const MUTE_KEY = "ai-assistant-muted";
const COURSE_DRAFT_KEY = "requisor-ai-course-draft";
const COURSE_DRAFT_EVENT = "requisor:open-ai-course-draft";
export function AiAssistant() {
  const { state, hydrated } = useStore();
  const router = useRouter();
  const isTutorMode = state.user?.role === "tutor" || state.user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [courseDraft, setCourseDraft] = useState<Course | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const [assistantPersona, setAssistantPersona] = useState<string>("");
  const [preferredLanguage, setPreferredLanguage] = useState<string>("");
  const [voiceMuted, setVoiceMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(MUTE_KEY) === "true";
  });
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const voiceChevronRef = useRef<HTMLButtonElement>(null);
  const [voicePickerPos, setVoicePickerPos] = useState({ top: 0, right: 0 });
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Typewriter reveal
  const fullTextRef = useRef("");
  const revealedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const networkDoneRef = useRef(false);
  const pauseUntilRef = useRef(0);
  // Track whether we've already spoken / navigated for the current AI reply
  const didSpeakRef = useRef(false);
  const didNavigateRef = useRef(false);
  const requestStartedAtRef = useRef(0);
  const requestFailedRef = useRef(false);
  const quickPrompts = isTutorMode ? TUTOR_QUICK_PROMPTS : LEARNER_QUICK_PROMPTS;
  const initials = (state.user?.name ?? "U").slice(0, 1).toUpperCase();
  const voice = useVoice();
  const waveBars = useMicWaveform(voice.isListening);
  const avatarState = voice.isSpeaking ? "speaking" : voice.isListening ? "listening" : "idle";
  // Load persisted preferences and also react immediately when Settings or
  // onboarding changes them while this shared assistant remains mounted.
  useEffect(() => {
    if (!hydrated || !state.user) return;
    function applyPreferences(data: {
      assistantPersona?: string;
      preferredLanguage?: string;
    }) {
      if (data.assistantPersona !== undefined) setAssistantPersona(data.assistantPersona);
      if (data.preferredLanguage !== undefined) setPreferredLanguage(data.preferredLanguage);
    }
    function handlePreferenceUpdate(event: Event) {
      applyPreferences((event as CustomEvent<{
        assistantPersona?: string;
        preferredLanguage?: string;
      }>).detail ?? {});
    }
    window.addEventListener(AI_GUIDE_PREFERENCES_UPDATED, handlePreferenceUpdate);
    fetch("/api/profile")
      .then((r) => r.json())
      .then(applyPreferences)
      .catch(() => {});
    return () => {
      window.removeEventListener(AI_GUIDE_PREFERENCES_UPDATED, handlePreferenceUpdate);
    };
  }, [hydrated, state.user]);
  // Once voices and a language preference are both known, pick a matching
  // voice automatically — but only if the user hasn't manually chosen one.
  useEffect(() => {
    if (voice.selectedVoiceName || !preferredLanguage || voice.voices.length === 0) return;
    const prefixes = LANGUAGE_VOICE_PREFIXES[preferredLanguage];
    if (!prefixes) return;
    for (const prefix of prefixes) {
      const match = voice.voices.find((v) => v.lang.startsWith(prefix));
      if (match) {
        voice.setSelectedVoiceName(match.name);
        break;
      }
    }
  }, [preferredLanguage, voice.voices, voice.selectedVoiceName, voice.setSelectedVoiceName]);
  // When a transcript arrives from STT, put it in the input box so the user
  // can see what was heard before it's sent.
  useEffect(() => {
    if (voice.transcript) {
      setInput(voice.transcript);
    }
  }, [voice.transcript]);
  // Auto-send as soon as the user stops speaking — no tap required.
  // We keep a stable ref to `send` so the effect closure never goes stale.
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const prevListeningRef = useRef(false);
  useEffect(() => {
    if (prevListeningRef.current && !voice.isListening && voice.transcript.trim()) {
      sendRef.current(voice.transcript);
    }
    prevListeningRef.current = voice.isListening;
  }, [voice.isListening, voice.transcript]);
  const resolveLesson = useMemo(
    () => (courseTitle: string, lessonTitle: string) => {
      const course = state.courses.find((c) => c.title.toLowerCase() === courseTitle.toLowerCase());
      const lesson = course?.lessons.find((l) => l.title.toLowerCase() === lessonTitle.toLowerCase());
      return course && lesson ? `/app/learn/?course=${course.slug}&lesson=${lesson.id}` : null;
    },
    [state.courses]
  );
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => {
    requestAbortRef.current?.abort();
    void streamReaderRef.current?.cancel("component_unmount").catch(() => undefined);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);
  // Auto-grow the composer textarea up to ~4 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);
  // Once hydrated, check for a rule-based nudge (stalled course).
  useEffect(() => {
    if (!hydrated || !state.user || isTutorMode) {
      setNudge(null);
      return;
    }
    setNudge(getNudge(state));
  }, [hydrated, isTutorMode, state]);
  // Persist mute preference
  function toggleMute() {
    const next = !voiceMuted;
    setVoiceMuted(next);
    localStorage.setItem(MUTE_KEY, String(next));
    if (next) voice.stopSpeaking();
  }
  function cancelActiveRequest() {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    void streamReaderRef.current?.cancel("user_cancelled").catch(() => undefined);
    streamReaderRef.current = null;
    networkDoneRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setStreaming(false);
  }
  function closePanel() {
    cancelActiveRequest();
    voice.stopSpeaking();
    setOpen(false);
  }
  function startRevealLoop() {
    const BASE_CPS = 60;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const target = fullTextRef.current.length;
      if (revealedRef.current < target && now >= pauseUntilRef.current) {
        const jitter = 0.75 + Math.sin(now / 137) * 0.25 + Math.random() * 0.15;
        revealedRef.current = Math.min(target, revealedRef.current + BASE_CPS * jitter * dt);
        let count = Math.floor(revealedRef.current);
        while (count > 0 && endsInOpenTag(fullTextRef.current.slice(0, count))) count--;
        const lastChar = fullTextRef.current[count - 1];
        if (lastChar && ".!?\n".includes(lastChar) && count === Math.floor(revealedRef.current)) {
          pauseUntilRef.current = now + 110;
        }
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: fullTextRef.current.slice(0, count) };
          return updated;
        });
      }
      const done = revealedRef.current >= target && networkDoneRef.current;
      if (!done) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setStreaming(false);
        const finalText = fullTextRef.current;
        trackEvent("ai_response_completed", {
          mode: isTutorMode ? "tutor" : "learner",
          response_length: finalText.length,
          duration_ms: Math.max(0, Math.round(performance.now() - requestStartedAtRef.current)),
          success: !requestFailedRef.current,
        });
        // Auto-speak the completed reply (unless muted)
        if (!didSpeakRef.current && !voiceMuted && voice.ttsSupported) {
          didSpeakRef.current = true;
          voice.speak(stripForSpeech(finalText));
        }
        // Auto-navigate to the first course/lesson tag in the reply
        if (!isTutorMode && !didNavigateRef.current) {
          didNavigateRef.current = true;
          const navUrl = extractFirstNavUrl(finalText, resolveLesson);
          if (navUrl) {
            // Small delay so the user sees the reply before being redirected
            setTimeout(() => router.push(navUrl), 1200);
          }
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    // Stop any ongoing speech before sending
    voice.stopSpeaking();
    setRetryText(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    fullTextRef.current = "";
    revealedRef.current = 0;
    networkDoneRef.current = false;
    pauseUntilRef.current = 0;
    didSpeakRef.current = false;
    didNavigateRef.current = false;
    requestStartedAtRef.current = performance.now();
    requestFailedRef.current = false;
    trackEvent("ai_message_sent", {
      mode: isTutorMode ? "tutor" : "learner",
      message_length: trimmed.length,
    });
    startRevealLoop();
    const requestController = new AbortController();
    requestAbortRef.current = requestController;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: requestController.signal,
        body: JSON.stringify({ messages: next }),
      });
      if (!res.body) throw new Error("No response body");
      if (!res.ok) setRetryText(trimmed);
      const reader = res.body.getReader();
      streamReaderRef.current = reader;
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullTextRef.current += decoder.decode(value, { stream: true });
      }
    } catch (error) {
      if (requestController.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return;
      }
      requestFailedRef.current = true;
      fullTextRef.current += "Sorry, something went wrong reaching the AI assistant.";
      setRetryText(trimmed);
    } finally {
      if (requestAbortRef.current === requestController) {
        requestAbortRef.current = null;
        streamReaderRef.current = null;
        networkDoneRef.current = true;
      }
    }
  }
  function openPanel() {
    setOpen(true);
    if (!isTutorMode && nudge && messages.length === 0) {
      setMessages([{ role: "assistant", content: nudge.message }]);
      markNudgeSeen(nudge.id);
      setNudge(null);
    }
  }
  function newChat() {
    cancelActiveRequest();
    voice.stopSpeaking();
    setMessages([]);
    setRetryText(null);
    setCourseDraft(null);
    setDraftError(null);
  }
  async function generateCourseDraft() {
    if (state.user?.role !== "tutor" || draftLoading || streaming) return;
    if (!messages.some((message) => message.role === "user")) {
      setInput("Create a course for [audience] about [topic], at [level], with [number] lessons and these outcomes: …");
      textareaRef.current?.focus();
      setDraftError("Describe the topic, audience, level, outcomes, and preferred lesson count first.");
      return;
    }
    setDraftLoading(true);
    setDraftError(null);
    try {
      const response = await fetch("/api/tutor/course-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const data = await response.json().catch(() => ({})) as { course?: Course; error?: string };
      if (!response.ok || !data.course) throw new Error(data.error ?? "Unable to generate a course draft.");
      setCourseDraft(data.course);
      trackEvent("ai_course_draft_generated", { lesson_count: data.course.lessons.length });
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Unable to generate a course draft.");
    } finally {
      setDraftLoading(false);
    }
  }
  function openCourseDraft() {
    if (!courseDraft) return;
    try {
      sessionStorage.setItem(COURSE_DRAFT_KEY, JSON.stringify(courseDraft));
    } catch {
      setDraftError("Your browser could not transfer the draft. Keep this chat open and try again.");
      return;
    }
    window.dispatchEvent(new CustomEvent(COURSE_DRAFT_EVENT, { detail: courseDraft }));
    closePanel();
    router.push("/app/tutor/?aiCourseDraft=1");
  }
  function handleMicClick() {
    if (voice.isListening) {
      voice.stopListening();
    } else {
      voice.startListening();
    }
  }
  return (
    <>
      {/* Floating trigger */}
      <div className="fixed bottom-5 right-5 z-40 flex h-24 w-24 items-center justify-center">
        {/* Speech bubble */}
        <AnimatePresence>
          {!open && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ delay: 1.2, duration: 0.25 }}
              className="absolute bottom-full right-0 mb-3 w-52 rounded-2xl rounded-br-sm px-3.5 py-2.5 bg-gray-200   shadow-soft"
            >
              <p className="text-[11px] font-medium leading-snug text-zinc-700">
                {isTutorMode
                  ? "Tell me your course topic and I’ll help shape the learning experience."
                  : "I’ll recommend courses using your background and progress."}
              </p>
              {/* Tail */}
              <span className="absolute -bottom-2 right-3 h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-gray-200 " />
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => (open ? closePanel() : openPanel())}
          aria-label={open ? "Close AI assistant" : "Open AI assistant"}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          className="relative z-10 flex h-24 w-24 items-center justify-center"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? "close" : "open"}
              initial={{ rotate: -45, scale: 0.7 }}
              animate={{ rotate: 0, scale: 1 }}
              exit={{ rotate: 45, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              className="flex h-full w-full items-center justify-center rounded-full"
            >
              {open ? (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-white">
                  <X className="h-5 w-5 text-zinc-700" />
                </span>
              ) : (
                <span className="flex h-full w-full items-center justify-center">
                  <span className="ai-bot" aria-hidden="true">
                    <span className="head">
                      <span className="face">
                        <span className="eyes" />
                        <span className="mouth" />
                      </span>
                    </span>
                  </span>
                </span>
              )}
            </motion.span>
          </AnimatePresence>
        </motion.button>
        {nudge && !open && (
          <span className="absolute right-1 top-1 z-20 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-500 ring-2 ring-white" />
          </span>
        )}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.94, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 16, scale: 0.96, filter: "blur(2px)" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-label={isTutorMode ? "AI course design assistant" : "AI learning assistant"}
            className="fixed bottom-24 right-5 z-40 flex h-[34rem] w-[23rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-card shadow-[0_25px_60px_-15px_rgba(15,23,42,0.25)]"
          >
            {/* Header */}
            <div className="relative flex items-center gap-2.5 overflow-hidden bg-gradient-to-r from-primary/[0.07] via-white to-white px-4 py-3.5">
              <motion.div
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary via-secondary to-primary"
                animate={{ backgroundPositionX: ["0%", "200%"] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                style={{ backgroundSize: "200% 100%" }}
              />
              <div className="relative shrink-0">
                <PersonaAvatar personaId={assistantPersona} size="sm" state={avatarState} className="shadow-glow-sm" />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-zinc-900">
                  {isTutorMode ? "Requisor Assistant" : getPersona(assistantPersona).name}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {isTutorMode ? "Course structure and content copilot" : "Guidance based on your background and progress"}
                </p>
              </div>
              {/* Mute/unmute TTS button — only shown when TTS is supported */}
              {voice.ttsSupported && (
                <div className="relative flex items-center">
                  <button
                    onClick={toggleMute}
                    aria-label={voiceMuted ? "Unmute voice response" : "Mute voice response"}
                    title={voiceMuted ? "Unmute voice" : "Mute voice"}
                    className="focus-ring shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    {voiceMuted ? (
                      <VolumeX className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className={cn("h-3.5 w-3.5", voice.isSpeaking && "text-primary")} />
                    )}
                  </button>
                  {/* Voice picker — chevron only; dropdown rendered as top-level sibling */}
                  {voice.voices.length > 0 && (
                    <button
                      ref={voiceChevronRef}
                      onClick={() => {
                        if (!showVoicePicker && voiceChevronRef.current) {
                          const r = voiceChevronRef.current.getBoundingClientRect();
                          setVoicePickerPos({
                            top: r.bottom + 6,
                            right: window.innerWidth - r.right,
                          });
                        }
                        setShowVoicePicker((v) => !v);
                      }}
                      title="Change AI voice"
                      aria-label="Change AI voice"
                      className="focus-ring -ml-0.5 shrink-0 rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
              {messages.length > 0 && (
                <button
                  onClick={newChat}
                  aria-label="Start a new chat"
                  title="New chat"
                  className="focus-ring shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={closePanel}
                aria-label="Close"
                className="focus-ring shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {isTutorMode && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                  <strong>AI draft:</strong> Review and edit suggestions before adding them to your course. Nothing is saved automatically.
                  {state.user?.role === "tutor" && (
                    <button type="button" onClick={() => void generateCourseDraft()} disabled={draftLoading || streaming} className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-900 px-3 py-2 font-semibold text-white disabled:opacity-60">
                      {draftLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookPlus className="h-3.5 w-3.5" />}
                      {draftLoading ? "Building course draft…" : "Create course from this chat"}
                    </button>
                  )}
                </div>
              )}
              {draftError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{draftError}</div>}
              {courseDraft && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="font-semibold text-zinc-900">{courseDraft.title}</p>
                  <p className="mt-1 text-xs text-zinc-600">{courseDraft.lessons.length} lessons · {courseDraft.level} · Unpublished draft</p>
                  <button type="button" onClick={openCourseDraft} className="focus-ring mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
                    <BookPlus className="h-3.5 w-3.5" />Review in course editor
                  </button>
                </div>
              )}
              {messages.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-4">
                  <p className="text-sm font-light text-zinc-600">
                    Hi {state.user?.name?.split(" ")[0] ?? "there"}.{" "}
                    {isTutorMode
                      ? "What course would you like to design? Include the topic, audience, or level if you know them."
                      : "Ask which course fits your background, or what to learn next based on your progress."}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {quickPrompts.map(({ icon: Icon, label }, i) => (
                      <motion.button
                        key={label}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.05 }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => send(label)}
                        className="focus-ring group flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 text-left text-xs font-medium text-zinc-700 shadow-soft transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-secondary group-hover:text-white">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {label}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
              {messages.map((m, i) => {
                const isLastAssistant = streaming && m.role === "assistant" && i === messages.length - 1;
                const isUser = m.role === "user";
                return (
                  <motion.div
                    key={i}
                    layout="position"
                    initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className={cn("flex items-end gap-2", isUser ? "justify-end" : "justify-start")}
                  >
                    {!isUser && (
                      <PersonaAvatar
                        personaId={assistantPersona}
                        size="xs"
                        state={isLastAssistant && streaming ? "speaking" : "idle"}
                        className="mb-0.5"
                      />
                    )}
                    <motion.div
                      layout
                      transition={{ layout: { duration: 0.18, ease: "easeOut" } }}
                      className={cn(
                        "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm font-light leading-relaxed",
                        isUser
                          ? "rounded-br-md bg-gradient-to-br from-primary to-secondary text-white shadow-glow-sm"
                          : "rounded-bl-md bg-white text-zinc-800 shadow-soft"
                      )}
                    >
                      {isLastAssistant && !m.content ? (
                        <TypingDots />
                      ) : m.role === "assistant" ? (
                        renderMarkdownLite(
                          m.content,
                          isLastAssistant ? <StreamCursor /> : null,
                          resolveLesson
                        )
                      ) : (
                        m.content
                      )}
                    </motion.div>
                    {isUser && (
                      <div className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-700">
                        {initials}
                      </div>
                    )}
                  </motion.div>
                );
              })}
              {retryText && !streaming && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start pl-8">
                  <button
                    onClick={() => send(retryText)}
                    className="focus-ring flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-soft transition hover:border-primary/60 hover:text-primary"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                </motion.div>
              )}
            </div>
            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="border-t border-zinc-100 p-3"
            >
              <div
                className={cn(
                  "flex items-end gap-1.5 rounded-2xl border p-1.5 pl-3.5 transition",
                  voice.isListening
                    ? "border-primary/40 bg-white ring-2 ring-primary/15"
                    : "border-border bg-zinc-50 focus-within:border-primary/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/15"
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {voice.isListening ? (
                    <motion.div
                      key="waveform"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="flex min-w-0 flex-1 items-center"
                      aria-live="polite"
                      aria-label="Recording — speak now"
                    >
                      <RecordingWaveform bars={waveBars} />
                    </motion.div>
                  ) : (
                    <motion.textarea
                      key="composer"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      ref={textareaRef}
                      rows={1}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      maxLength={2000}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send(input);
                        }
                      }}
                      placeholder={isTutorMode ? "Describe a course you want to design…" : "Ask what course fits you next…"}
                      disabled={streaming}
                      className="max-h-[120px] flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
                    />
                  )}
                </AnimatePresence>
                {/* Mic voice orb — only shown when STT is supported */}
                {voice.sttSupported && (
                  <div className="container-vao-input">
                    {/* Hidden SVG gooey filter for the mic orb */}
                    <svg
                      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
                      aria-hidden="true"
                    >
                      <defs>
                        <filter id="gooey-mic">
                          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
                          <feColorMatrix
                            in="blur"
                            mode="matrix"
                            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
                            result="gooey"
                          />
                          <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
                        </filter>
                      </defs>
                    </svg>
                    <button
                      type="button"
                      onClick={handleMicClick}
                      disabled={streaming}
                      aria-label={voice.isListening ? "Stop listening" : "Start voice input"}
                      title={voice.isListening ? "Stop listening" : "Start voice input"}
                      className={cn(
                        "orb orb-input focus-ring disabled:opacity-40",
                        voice.isListening && "orb-listening"
                      )}
                    >
                      <div className="icons">
                        {voice.isListening ? (
                          /* Mic-off icon */
                          <svg
                            className="svg"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <line x1="1" y1="1" x2="23" y2="23" />
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        ) : (
                          /* Mic icon */
                          <svg
                            className="svg"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                            <line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                        )}
                      </div>
                      <div className="ball">
                        <div className="container-lines" />
                        <div className="container-rings" />
                      </div>
                    </button>
                  </div>
                )}
                <motion.button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  aria-label="Send message"
                  whileHover={{ scale: streaming || !input.trim() ? 1 : 1.06 }}
                  whileTap={{ scale: streaming || !input.trim() ? 1 : 0.94 }}
                  className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-sm transition-opacity disabled:opacity-40"
                >
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </motion.button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice picker dropdown — rendered outside the overflow-hidden panel */}
      {showVoicePicker && (
        <>
          <div
            className="fixed inset-0 z-[49]"
            onClick={() => setShowVoicePicker(false)}
          />
          <div
            className="fixed z-50 w-64 rounded-xl border border-border bg-white p-2 shadow-lg"
            style={{ top: voicePickerPos.top, right: voicePickerPos.right }}
          >
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              AI voice
            </p>
            <div className="max-h-52 overflow-y-auto">
              {(() => {
                const BLOCKED_PREFIXES = [
                  "Microsoft David",
                  "Microsoft Ravi",
                  "Microsoft Heera",
                  "Microsoft Mark",
                  "Microsoft Zira",
                  "Google UK English Male",
                  "Google español de Estados Unidos",
                  "Google Bahasa Indonesia",
                ];
                const VOICE_LABELS: Array<{ prefix: string; label: string; desc: string }> = [
                  { prefix: "en-US", label: "Chloe",    desc: "English (USA)" },
                  { prefix: "en-GB", label: "Emilia",   desc: "English (United Kingdom)" },
                  { prefix: "de-",   label: "Hannah",   desc: "English (German)" },
                  { prefix: "pt-BR", label: "Beatriz",  desc: "English (Brazilian Portuguese)" },
                  { prefix: "es-",   label: "Carlos",   desc: "English (Spanish)" },
                  { prefix: "fr-",   label: "Camille",  desc: "English (French)" },
                  { prefix: "en-IN", label: "Ananya",   desc: "English (Indian / Hindi)" },
                  { prefix: "hi-",   label: "Ananya",   desc: "English (Indian / Hindi)" },
                  { prefix: "it-",   label: "Giulia",   desc: "English (Italian)" },
                  { prefix: "ja-",   label: "Yuki",     desc: "English (Japanese)" },
                  { prefix: "ko-",   label: "Yuna",     desc: "English (Korean)" },
                  { prefix: "nl-",   label: "Fleur",    desc: "English (Dutch)" },
                  { prefix: "pl-",   label: "Zofia",    desc: "English (Polish)" },
                  { prefix: "ru-",   label: "Elena",    desc: "English (Russian)" },
                  { prefix: "zh-CN", label: "Lin",      desc: "English (Mandarin — Mainland China)" },
                  { prefix: "zh-HK", label: "Wing-Yee", desc: "English (Cantonese — Hong Kong)" },
                  { prefix: "zh-TW", label: "Mei-Ling", desc: "English (Mandarin — Taiwan)" },
                ];
                const getLabel = (v: SpeechSynthesisVoice) =>
                  VOICE_LABELS.find((d) => v.lang.startsWith(d.prefix));
                // Filter blocked voices then deduplicate so each label appears once
                const seenLabels = new Set<string>();
                const filtered = voice.voices
                  .filter((v) => !BLOCKED_PREFIXES.some((p) => v.name.startsWith(p)))
                  .filter((v) => {
                    const mapped = getLabel(v);
                    const key = mapped ? mapped.label : v.name;
                    if (seenLabels.has(key)) return false;
                    seenLabels.add(key);
                    return true;
                  });
                return filtered;
              })().map((v) => {
                const VOICE_LABELS: Array<{ prefix: string; label: string; desc: string }> = [
                  { prefix: "en-US", label: "Chloe",    desc: "English (USA)" },
                  { prefix: "en-GB", label: "Emilia",   desc: "English (United Kingdom)" },
                  { prefix: "de-",   label: "Hannah",   desc: "English (German)" },
                  { prefix: "pt-BR", label: "Beatriz",  desc: "English (Brazilian Portuguese)" },
                  { prefix: "es-",   label: "Carlos",   desc: "English (Spanish)" },
                  { prefix: "fr-",   label: "Camille",  desc: "English (French)" },
                  { prefix: "en-IN", label: "Ananya",   desc: "English (Indian / Hindi)" },
                  { prefix: "hi-",   label: "Ananya",   desc: "English (Indian / Hindi)" },
                  { prefix: "it-",   label: "Giulia",   desc: "English (Italian)" },
                  { prefix: "ja-",   label: "Yuki",     desc: "English (Japanese)" },
                  { prefix: "ko-",   label: "Yuna",     desc: "English (Korean)" },
                  { prefix: "nl-",   label: "Fleur",    desc: "English (Dutch)" },
                  { prefix: "pl-",   label: "Zofia",    desc: "English (Polish)" },
                  { prefix: "ru-",   label: "Elena",    desc: "English (Russian)" },
                  { prefix: "zh-CN", label: "Lin",      desc: "English (Mandarin — Mainland China)" },
                  { prefix: "zh-HK", label: "Wing-Yee", desc: "English (Cantonese — Hong Kong)" },
                  { prefix: "zh-TW", label: "Mei-Ling", desc: "English (Mandarin — Taiwan)" },
                ];
                const mapped = VOICE_LABELS.find((d) => v.lang.startsWith(d.prefix));
                const displayName = mapped?.label ?? v.name;
                const displayDesc = mapped?.desc ?? v.lang;
                return (
                <button
                  key={v.name}
                  onClick={() => {
                    voice.setSelectedVoiceName(v.name);
                    setShowVoicePicker(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                    voice.selectedVoiceName === v.name
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-zinc-700 hover:bg-zinc-100"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{displayName}</span>
                    <span className={cn("text-[10px]", voice.selectedVoiceName === v.name ? "text-primary/60" : "text-zinc-400")}>{displayDesc}</span>
                  </span>
                  {voice.selectedVoiceName === v.name && (
                    <Check className="h-3 w-3 shrink-0 text-primary" />
                  )}
                </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
