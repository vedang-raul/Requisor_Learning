"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { Lesson } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}


export function LessonQuiz({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setQuestions(null);
    setAnswers({});
    setSubmitted(false);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonTitle: lesson.title,
          description: lesson.description,
          keyTakeaways: lesson.keyTakeaways,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate quiz.");
      setQuestions(data.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate a quiz right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const allAnswered = questions !== null && questions.every((_, i) => answers[i] !== undefined);
  const score = questions && submitted ? questions.filter((q, i) => answers[i] === q.correctIndex).length : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-16 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -14, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="glass-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Lesson quiz"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-900">Test yourself</p>
            <p className="truncate text-xs text-zinc-500">{lesson.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close quiz" className="shrink-0 text-zinc-500 hover:text-zinc-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-zinc-500">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              Generating a personalised quiz…
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-zinc-600">{error}</p>
              <Button size="sm" variant="outline" onClick={generate}>
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && questions && (
            <>
              {questions.map((q, qi) => (
                <div key={qi} className="space-y-2.5">
                  <p className="text-sm font-medium text-zinc-900">
                    {qi + 1}. {q.question}
                  </p>
                  <div className="space-y-1.5">
                    {q.options.map((opt, oi) => {
                      const selected = answers[qi] === oi;
                      const isCorrect = oi === q.correctIndex;
                      const showState = submitted;
                      return (
                        <button
                          key={oi}
                          disabled={submitted}
                          onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                          className={cn(
                            "focus-ring flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition disabled:cursor-default",
                            showState && isCorrect && "border-emerald-500/50 bg-emerald-500/10 text-emerald-800",
                            showState && selected && !isCorrect && "border-red-500/50 bg-red-500/10 text-red-800",
                            !showState && selected && "border-primary/50 bg-primary/10 text-zinc-900",
                            !showState && !selected && "border-border bg-white text-zinc-700 hover:border-zinc-300"
                          )}
                        >
                          {showState && isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                          {showState && selected && !isCorrect && <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
                          <span className="flex-1">{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                  {submitted && <p className="text-xs leading-relaxed text-zinc-500">{q.explanation}</p>}
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                {submitted ? (
                  <>
                    <p className="text-sm font-medium text-zinc-800">
                      Score: {score}/{questions.length}
                    </p>
                    <Button size="sm" variant="outline" onClick={generate}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      New quiz
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={!allAnswered} onClick={() => setSubmitted(true)} className="ml-auto">
                    Submit answers
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
