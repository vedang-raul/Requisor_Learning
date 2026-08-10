"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Compass, ListChecks, Loader2, Mic, MicOff, RotateCcw, Send, Sparkles, TrendingUp, Volume2, VolumeX, X, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { buildProgressContext } from "@/lib/ai-context";
import { getNudge, markNudgeSeen, type Nudge } from "@/lib/nudges";
import { cn } from "@/lib/utils";
import { renderMarkdownLite, endsInOpenTag } from "@/components/markdown-lite";
import { useVoice } from "@/hooks/use-voice";
type ChatMessage = { role: "user" | "assistant"; content: string };
const QUICK_PROMPTS = [
  { icon: TrendingUp, label: "How am I doing overall?" },
  { icon: Compass, label: "What should I learn next?" },
  { icon: ListChecks, label: "Summarize my progress" },
  { icon: TrendingUp, label: "How do I earn more XP?" },
];
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
export function AiAssistant() {
  const { state, hydrated } = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
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
  const networkDoneRef = useRef(false);
  const pauseUntilRef = useRef(0);
  // Track whether we've already spoken / navigated for the current AI reply
  const didSpeakRef = useRef(false);
  const didNavigateRef = useRef(false);
  const progressContext = useMemo(() => buildProgressContext(state), [state]);
  const initials = (state.user?.name ?? "U").slice(0, 1).toUpperCase();
  const voice = useVoice();
  const waveBars = useMicWaveform(voice.isListening);
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
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);
  // Auto-grow the composer textarea up to ~4 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);
  // Once hydrated, check for a rule-based nudge (stalled course).
  useEffect(() => {
    if (!hydrated || !state.user) return;
    setNudge(getNudge(state));
  }, [hydrated, state]);
  // Persist mute preference
  function toggleMute() {
    const next = !voiceMuted;
    setVoiceMuted(next);
    localStorage.setItem(MUTE_KEY, String(next));
    if (next) voice.stopSpeaking();
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
        // Auto-speak the completed reply (unless muted)
        if (!didSpeakRef.current && !voiceMuted && voice.ttsSupported) {
          didSpeakRef.current = true;
          voice.speak(stripForSpeech(finalText));
        }
        // Auto-navigate to the first course/lesson tag in the reply
        if (!didNavigateRef.current) {
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
    startRevealLoop();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, progressContext }),
      });
      if (!res.body) throw new Error("No response body");
      if (!res.ok) setRetryText(trimmed);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullTextRef.current += decoder.decode(value, { stream: true });
      }
    } catch {
      fullTextRef.current += "Sorry, something went wrong reaching the AI assistant.";
      setRetryText(trimmed);
    } finally {
      networkDoneRef.current = true;
    }
  }
  function openPanel() {
    setOpen(true);
    if (nudge && messages.length === 0) {
      setMessages([{ role: "assistant", content: nudge.message }]);
      markNudgeSeen(nudge.id);
      setNudge(null);
    }
  }
  function newChat() {
    voice.stopSpeaking();
    setMessages([]);
    setRetryText(null);
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
      <div className="fixed bottom-5 right-5 z-40 flex h-20 w-20 items-center justify-center">
        {!open && (
          <>
            <motion.span
              className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/40 to-secondary/40"
              animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30"
              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            />
          </>
        )}
        <motion.button
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-label={open ? "Close AI assistant" : "Open AI assistant"}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          animate={{ boxShadow: open ? "0 8px 24px -6px rgba(0,0,0,0.25)" : "0 10px 30px -6px rgba(0,0,0,0.3)" }}
          className="relative z-10 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-secondary p-[3px]"
        >
          <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={open ? "close" : "open"}
                initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                transition={{ duration: 0.15 }}
                className="flex h-full w-full items-center justify-center"
              >
                {open ? (
                  <X className="h-5 w-5 text-zinc-700" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/requisor.png" alt="Requisor" className="h-full w-full scale-[1.35] rounded-full object-cover" />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
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
            aria-label="AI learning assistant"
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
                <div className="h-9 w-9 overflow-hidden rounded-xl shadow-glow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/requisor.png" alt="Requisor" className="h-full w-full scale-[1.35] object-cover" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-zinc-900">
                  Requisor Assistant

                </p>
                <p className="truncate text-xs text-zinc-500">Knows your progress across all paths</p>
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
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="focus-ring shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="space-y-4">
                  <p className="text-sm font-light text-zinc-600">
                    Hi {state.user?.name?.split(" ")[0] ?? "there"} 👋 Ask me about your progress, or what to learn next.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {QUICK_PROMPTS.map(({ icon: Icon, label }, i) => (
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
                      <div className="mb-0.5 h-6 w-6 shrink-0 overflow-hidden rounded-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/requisor.png" alt="" className="h-full w-full scale-[1.35] object-cover" />
                      </div>
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          send(input);
                        }
                      }}
                      placeholder="Ask about your progress…"
                      disabled={streaming}
                      className="max-h-[120px] flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
                    />
                  )}
                </AnimatePresence>
                {/* Mic button — only shown when STT is supported */}
                {voice.sttSupported && (
                  <motion.button
                    type="button"
                    onClick={handleMicClick}
                    disabled={streaming}
                    aria-label={voice.isListening ? "Stop listening" : "Start voice input"}
                    title={voice.isListening ? "Stop listening" : "Start voice input"}
                    whileHover={{ scale: streaming ? 1 : 1.06 }}
                    whileTap={{ scale: streaming ? 1 : 0.94 }}
                    className={cn(
                      "focus-ring relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm transition-opacity disabled:opacity-40",
                      voice.isListening
                        ? "bg-gradient-to-br from-primary to-secondary text-white"
                        : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
                    )}
                  >
                    {voice.isListening && (
                      <motion.span
                        className="absolute inset-0 rounded-xl bg-white"
                        animate={{ opacity: [0.25, 0, 0.25] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    {voice.isListening ? (
                      <MicOff className="relative h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4 text-zinc-600" />
                    )}
                  </motion.button>
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