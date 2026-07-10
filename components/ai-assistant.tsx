"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { buildProgressContext } from "@/lib/ai-context";
import { getNudge, markNudgeSeen, type Nudge } from "@/lib/nudges";
import { cn } from "@/lib/utils";
import { renderMarkdownLite, endsInOpenTag } from "@/components/markdown-lite";

type ChatMessage = { role: "user" | "assistant"; content: string };

const QUICK_PROMPTS = [
  "How am I doing overall?",
  "What should I learn next?",
  "Summarize my progress",
  "Tips to keep my streak going?",
];

export function AiAssistant() {
  const { state, hydrated } = useStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [nudge, setNudge] = useState<Nudge | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Typewriter reveal: network chunks land in fullTextRef, a rAF loop
  // reveals them at a steady character rate so the reply always looks
  // typed, regardless of how chunky the actual stream is. Reveal is
  // clamped so it never stops mid-{{tag}} — it "pops in" whole instead.
  const fullTextRef = useRef("");
  const revealedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const networkDoneRef = useRef(false);

  const progressContext = useMemo(() => buildProgressContext(state), [state]);

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

  return (
    <>
      {/* Floating trigger */}
      <motion.button
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="focus-ring fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-white shadow-glow-sm"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-6 w-6" />}
        {nudge && !open && (
          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 animate-pulse rounded-full bg-amber-500 ring-2 ring-white" />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-label="AI learning assistant"
            className="glass-card fixed bottom-24 right-5 z-40 flex h-[32rem] w-[23rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden p-0"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900">Requisor Assistant</p>
                <p className="truncate text-xs text-zinc-500">Knows your progress across all paths</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-zinc-500 hover:text-zinc-900">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-light text-zinc-600">
                    Hi {state.user?.name?.split(" ")[0] ?? "there"} 👋 Ask me about your progress, or what to learn next.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((p) => (
                      <button
                        key={p}
                        onClick={() => send(p)}
                        className="focus-ring rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-primary/60 hover:text-primary"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                const isLastAssistant = streaming && m.role === "assistant" && i === messages.length - 1;
                return (
                  <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm font-light leading-relaxed",
                        m.role === "user" ? "bg-primary text-white" : "border border-zinc-200 bg-white text-zinc-800"
                      )}
                    >
                      {m.role === "assistant"
                        ? renderMarkdownLite(
                            m.content,
                            isLastAssistant ? (
                              <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse-cursor bg-zinc-400 align-middle" />
                            ) : null,
                            resolveLesson
                          )
                        : m.content}
                      {isLastAssistant && !m.content && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                    </div>
                  </div>
                );
              })}
              {retryText && !streaming && (
                <div className="flex justify-start">
                  <button
                    onClick={() => send(retryText)}
                    className="focus-ring flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-primary/60 hover:text-primary"
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
              className="flex items-center gap-2 border-t border-zinc-200 p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your progress…"
                disabled={streaming}
                className="h-10 flex-1 rounded-xl border border-border bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                aria-label="Send message"
                className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition disabled:opacity-40"
              >
                {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
