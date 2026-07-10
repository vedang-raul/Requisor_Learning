"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Compass, Flame, ListChecks, Loader2, RotateCcw, Send, TrendingUp, X } from "lucide-react";
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
  { icon: Flame, label: "Tips to keep my streak going?" },
];

function TypingDots() {
  return (
    <span className="flex items-center gap-1 px-0.5 py-1.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
    </span>
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
  // reveals them at a steady character rate so the reply always looks
  // typed, regardless of how chunky the actual stream is. Reveal is
  // clamped so it never stops mid-{{tag}} — it "pops in" whole instead.
  const fullTextRef = useRef("");
  const revealedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const networkDoneRef = useRef(false);

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

  // Once hydrated, check for a rule-based nudge (streak at risk, stalled course).
  // Shown at most once per day per nudge id via localStorage.
  useEffect(() => {
    if (!hydrated || !state.user) return;
    setNudge(getNudge(state));
  }, [hydrated, state]);

  function startRevealLoop() {
    const CHARS_PER_SECOND = 55;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const target = fullTextRef.current.length;
      if (revealedRef.current < target) {
        revealedRef.current = Math.min(target, revealedRef.current + CHARS_PER_SECOND * dt);
        let count = Math.floor(revealedRef.current);
        // Don't reveal into the middle of a {{lesson|...}} tag — hold until it closes.
        while (count > 0 && endsInOpenTag(fullTextRef.current.slice(0, count))) count--;
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
      <motion.button
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "focus-ring fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-white shadow-[0_8px_24px_-6px_rgba(35,174,151,0.55)] transition-shadow hover:shadow-[0_10px_30px_-6px_rgba(35,174,151,0.7)]",
          open ? "bg-gradient-to-br from-primary to-secondary" : "bg-white"
        )}
      >
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
              <X className="h-5 w-5" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/requisor.png" alt="Requisor" className="h-full w-full rounded-full object-cover" />
            )}
          </motion.span>
        </AnimatePresence>
        {nudge && !open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-500 ring-2 ring-white" />
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-label="AI learning assistant"
            className="fixed bottom-24 right-5 z-40 flex h-[34rem] w-[23rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-card shadow-[0_25px_60px_-15px_rgba(15,23,42,0.25)]"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-primary/[0.06] via-white to-white px-4 py-3.5">
              <div className="relative shrink-0">
                <div className="h-9 w-9 overflow-hidden rounded-xl shadow-glow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/requisor.png" alt="Requisor" className="h-full w-full object-cover" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900">Requisor Assistant</p>
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
                <div className="space-y-4">
                  <p className="text-sm font-light text-zinc-600">
                    Hi {state.user?.name?.split(" ")[0] ?? "there"} 👋 Ask me about your progress, or what to learn next.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {QUICK_PROMPTS.map(({ icon: Icon, label }) => (
                      <button
                        key={label}
                        onClick={() => send(label)}
                        className="focus-ring group flex items-center gap-2.5 rounded-xl border border-border bg-white px-3 py-2.5 text-left text-xs font-medium text-zinc-700 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                const isLastAssistant = streaming && m.role === "assistant" && i === messages.length - 1;
                const isUser = m.role === "user";
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn("flex items-end gap-2", isUser ? "justify-end" : "justify-start")}
                  >
                    {!isUser && (
                      <div className="mb-0.5 h-6 w-6 shrink-0 overflow-hidden rounded-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/requisor.png" alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div
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
                          isLastAssistant ? (
                            <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse-cursor bg-zinc-400 align-middle" />
                          ) : null,
                          resolveLesson
                        )
                      ) : (
                        m.content
                      )}
                    </div>
                    {isUser && (
                      <div className="mb-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-700">
                        {initials}
                      </div>
                    )}
                  </motion.div>
                );
              })}
              {retryText && !streaming && (
                <div className="flex justify-start pl-8">
                  <button
                    onClick={() => send(retryText)}
                    className="focus-ring flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-soft transition hover:border-primary/60 hover:text-primary"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </button>
                </div>
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
                <button
                  type="submit"
                  disabled={streaming || !input.trim()}
                  aria-label="Send message"
                  className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-secondary disabled:opacity-40 disabled:hover:bg-primary"
                >
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
