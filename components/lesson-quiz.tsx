"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuizQuestion {
  id: string;
  concept: string;
  question: string;
  options: string[];
}

interface GradeResult {
  id: string;
  correct: boolean;
  correctOption: string;
  explanation: string;
}

type QuizState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; quizId: number; questions: QuizQuestion[] }
  | { status: "grade-error"; quizId: number; questions: QuizQuestion[]; message: string }
  | { status: "submitting"; quizId: number; questions: QuizQuestion[] }
  | { status: "submitted"; quizId: number; questions: QuizQuestion[]; score: number; total: number; results: GradeResult[] };

export function LessonQuiz({
  lessonId,
  lessonTitle,
  onClose,
}: {
  lessonId: string;
  lessonTitle: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<QuizState>({ status: "loading" });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  async function generate() {
    setState({ status: "loading" });
    setAnswers({});
    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The server, not this component, supplies lesson context to xAI.
        body: JSON.stringify({ lessonId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        quizId?: number;
        questions?: QuizQuestion[];
        error?: string;
      };
      if (!response.ok || !Number.isInteger(data.quizId) || !Array.isArray(data.questions)) {
        throw new Error(data.error || "Failed to generate quiz.");
      }
      setState({ status: "ready", quizId: data.quizId as number, questions: data.questions });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Couldn't generate a quiz right now. Please try again.",
      });
    }
  }

  useEffect(() => {
    generate();
    // Generate only for the current lesson. generate is intentionally local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const activeQuestions =
    state.status === "ready" || state.status === "grade-error" || state.status === "submitting" || state.status === "submitted"
      ? state.questions
      : [];
  const allAnswered = activeQuestions.length > 0 && activeQuestions.every((question) => answers[question.id] !== undefined);
  const resultById = useMemo(
    () => new Map(state.status === "submitted" ? state.results.map((result) => [result.id, result]) : []),
    [state]
  );

  async function submit() {
    if ((state.status !== "ready" && state.status !== "grade-error") || !allAnswered) return;
    const previous = state;
    setState({ status: "submitting", quizId: state.quizId, questions: state.questions });
    try {
      const response = await fetch("/api/quiz/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: previous.quizId, answers }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        score?: number;
        total?: number;
        results?: GradeResult[];
        error?: string;
      };
      if (!response.ok || !Number.isInteger(data.score) || !Number.isInteger(data.total) || !Array.isArray(data.results)) {
        if (response.status === 409) {
          setState({
            status: "grade-error",
            quizId: previous.quizId,
            questions: previous.questions,
            message: data.error || "This quiz was already submitted. Generate a new quiz to continue.",
          });
          return;
        }
        throw new Error(data.error || "Couldn't grade this quiz right now.");
      }
      setState({
        status: "submitted",
        quizId: previous.quizId,
        questions: previous.questions,
        score: data.score as number,
        total: data.total as number,
        results: data.results,
      });
    } catch (error) {
      setState({
        status: "grade-error",
        quizId: previous.quizId,
        questions: previous.questions,
        message: error instanceof Error ? error.message : "Couldn't grade this quiz right now. Please try again.",
      });
    }
  }

  const isBusy = state.status === "loading" || state.status === "submitting";
  const submitted = state.status === "submitted";
  const retryableGradeError = state.status === "grade-error" && !state.message.includes("already submitted");

  function trapFocus(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-8 backdrop-blur-sm sm:pt-16"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: -14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -14, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="glass-card max-h-[88vh] w-full max-w-lg overflow-y-auto p-0"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={trapFocus}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-quiz-title"
        ref={dialogRef}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <p id="lesson-quiz-title" className="truncate text-sm font-semibold text-zinc-900">Test yourself</p>
            <p className="truncate text-xs text-zinc-500">{lessonTitle}</p>
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Close quiz" className="focus-ring shrink-0 rounded p-1 text-zinc-500 hover:text-zinc-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {isBusy && (
            <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-sm text-zinc-500">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              {state.status === "submitting" ? "Grading your answers…" : "Generating a personalised quiz…"}
            </div>
          )}

          {state.status === "error" && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p role="alert" className="text-sm text-zinc-600">{state.message}</p>
              <Button size="sm" variant="outline" onClick={generate}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Try another quiz
              </Button>
            </div>
          )}

          {!isBusy && (state.status === "ready" || state.status === "grade-error" || submitted) && (
            <>
              {activeQuestions.map((question, index) => {
                const result = resultById.get(question.id);
                return (
                  <div key={question.id} className="space-y-2.5">
                    <p className="text-sm font-medium text-zinc-900">
                      {index + 1}. {question.question}
                    </p>
                    <div className="space-y-1.5" role="radiogroup" aria-label={`Question ${index + 1} answers`}>
                      {question.options.map((option, optionIndex) => {
                        const selected = answers[question.id] === optionIndex;
                        const correctOption = submitted && result?.correctOption === option;
                        const selectedIncorrect = submitted && selected && !result?.correct;
                        return (
                          <button
                            key={optionIndex}
                            role="radio"
                            aria-checked={selected}
                            aria-label={
                              submitted
                                ? `${option}. ${correctOption ? "Correct answer." : selectedIncorrect ? "Your selected answer was incorrect." : ""}`
                                : option
                            }
                            disabled={submitted}
                            onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}
                            className={cn(
                              "focus-ring flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition disabled:cursor-default",
                              correctOption && "border-emerald-500/50 bg-emerald-500/10 text-emerald-800",
                              selectedIncorrect && "border-red-500/50 bg-red-500/10 text-red-800",
                              !submitted && selected && "border-primary/50 bg-primary/10 text-zinc-900",
                              !submitted && !selected && "border-border bg-white text-zinc-700 hover:border-zinc-300"
                            )}
                          >
                            {correctOption && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
                            {selectedIncorrect && <XCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />}
                            <span className="flex-1">{option}</span>
                          </button>
                        );
                      })}
                    </div>
                    {submitted && result && <p className="text-xs leading-relaxed text-zinc-500">{result.explanation}</p>}
                  </div>
                );
              })}

              <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                {submitted ? (
                  <>
                    <p aria-live="polite" className="text-sm font-medium text-zinc-800">
                      Score: {state.score}/{state.total}
                    </p>
                    <Button size="sm" variant="outline" onClick={generate}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      New quiz
                    </Button>
                  </>
                ) : state.status === "grade-error" ? (
                  <>
                    <p role="alert" className="text-sm text-red-700">{state.message}</p>
                    {retryableGradeError ? (
                      <Button size="sm" onClick={submit} className="w-full sm:w-auto">
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        Retry grading
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={generate} className="w-full sm:w-auto">
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        New quiz
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" disabled={!allAnswered} onClick={submit} className="w-full sm:ml-auto sm:w-auto">
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