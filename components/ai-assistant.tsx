"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, ListChecks, Loader2, RotateCcw, Send, Sparkles, TrendingUp, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { buildProgressContext } from "@/lib/ai-context";
import { getNudge, markNudgeSeen, type Nudge } from "@/lib/nudges";
import { cn } from "@/lib/utils";
import { renderMarkdownLite, endsInOpenTag } from "@/components/markdown-lite";

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

export function AiAssistant() {
  const { state, hydrated } = useStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Typewriter reveal: network chunks land in fullTextRef, a rAF loop
  // reveals them at an organic, slightly variable character rate so the
  // reply always looks typed, regardless of how chunky the actual stream
  // is. Reveal is clamped so it never stops mid-{{tag}} — it "pops in"
  // whole instead. Speed eases in and briefly settles after punctuation,
  // mimicking a natural typing cadence instead of a flat metronome.
  const fullTextRef = useRef("");
  const revealedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const networkDoneRef = useRef(false);
  const pauseUntilRef = useRef(0);

  const progressContext = useMemo(() => buildProgressContext(state), [state]);
  const initials = (state.user?.name ?? "U").slice(0, 1).toUpperCase();

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
  // Shown at most once per day per nudge id via localStorage.
  useEffect(() => {
    if (!hydrated || !state.user) return;
    setNudge(getNudge(state));
  }, [hydrated, state]);

  function startRevealLoop() {
    const BASE_CPS = 60;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const target = fullTextRef.current.length;

      if (revealedRef.current < target && now >= pauseUntilRef.current) {
        // Gentle organic jitter around the base speed instead of a flat rate.
        const jitter = 0.75 + Math.sin(now / 137) * 0.25 + Math.random() * 0.15;
        revealedRef.current = Math.min(target, revealedRef.current + BASE_CPS * jitter * dt);

        let count = Math.floor(revealedRef.current);
        // Don't reveal into the middle of a {{lesson|...}} tag — hold until it closes.
        while (count > 0 && endsInOpenTag(fullTextRef.current.slice(0, count))) count--;

        // Brief natural pause right after sentence-ending punctuation.
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

      if (revealedRef.current < target || !networkDoneRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        setStreaming(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setRetryText(null);
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    fullTextRef.current = "";
    revealedRef.current = 0;
    networkDoneRef.current = false;
    pauseUntilRef.current = 0;
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
    setMessages([]);
    setRetryText(null);
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
              <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-zinc-50 p-1.5 pl-3.5 transition focus-within:border-primary/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/15">
                <textarea
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
    </>
  );
}