"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type QuestionKey = "expertise" | "qualification" | "experience" | "purpose";

type Question = {
  key: QuestionKey;
  label: string;
  hint?: string;
  placeholder: string;
  multiline?: boolean;
};

const QUESTIONS: Question[] = [
  {
    key: "expertise",
    label: "What subjects do you teach?",
    hint: "Separate multiple subjects with commas.",
    placeholder: "e.g. Calculus, Organic Chemistry, Python",
  },
  {
    key: "qualification",
    label: "What's your highest qualification?",
    hint: "Degree, institution, and year, if you have it handy.",
    placeholder: "e.g. M.Sc. Mathematics — Stanford University, 2021",
  },
  {
    key: "experience",
    label: "How much teaching experience do you have?",
    hint: "A rough number is fine.",
    placeholder: "e.g. 5 years, mostly high-school algebra",
  },
  {
    key: "purpose",
    label: "Why did you choose Requisor?",
    hint: "One or two sentences is plenty.",
    placeholder: "Tell us what brought you here…",
    multiline: true,
  },
];

type Answers = Record<QuestionKey, string>;
const EMPTY_ANSWERS: Answers = { expertise: "", qualification: "", experience: "", purpose: "" };

export interface TutorSurveyProps {
  onSubmit?: (answers: Answers) => void | Promise<void>;
}

const swipeVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};
const swipeTransition = { type: "spring" as const, stiffness: 320, damping: 30 };

export default function TutorSurvey({ onSubmit }: TutorSurveyProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const total = QUESTIONS.length;
  const currentQuestion = step > 0 ? QUESTIONS[step - 1] : null;

  function updateAnswer(value: string) {
    if (!currentQuestion) return;
    setAnswers((current) => ({ ...current, [currentQuestion.key]: value }));
    if (error) setError("");
  }

  function next() {
    if (!currentQuestion) {
      setDirection(1);
      setStep(1);
      return;
    }

    if (!answers[currentQuestion.key].trim()) {
      setError(`Please answer: ${currentQuestion.label}`);
      return;
    }

    setError("");
    setDirection(1);
    if (step === total) {
      void submit();
    } else {
      setStep((current) => current + 1);
    }
  }

  function back() {
    setError("");
    setDirection(-1);
    setStep((current) => Math.max(0, current - 1));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Enter" && (!currentQuestion?.multiline || !event.shiftKey)) {
      event.preventDefault();
      next();
    }
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit?.({
        expertise: answers.expertise.trim(),
        qualification: answers.qualification.trim(),
        experience: answers.experience.trim(),
        purpose: answers.purpose.trim(),
      });
    } catch {
      setError("We couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <AnimatePresence mode="wait" custom={direction}>
        {step === 0 ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.25 }}
            className="glass-card w-full max-w-md p-8 text-center"
          >
            <motion.div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl shadow-glow"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <img src="/requisor.png" alt="Requisor" className="h-full w-full scale-[1.35] rounded-full object-cover" />
            </motion.div>
            <h2 className="text-xl font-bold text-zinc-900">Set up your tutor profile</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Answer {total} quick questions so learners can get the best guidance from you.
            </p>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button className="mt-6 w-full gap-2" onClick={next}>
                Let&apos;s go <ChevronRight className="h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.25 }}
            className="glass-card w-full max-w-md overflow-hidden p-8"
          >
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-900">Quick tutor profile</h2>
                <span className="text-xs font-medium text-zinc-400">{step} / {total}</span>
              </div>
              <div className="flex items-center gap-1.5" aria-label={`Question ${step} of ${total}`}>
                {QUESTIONS.map((question, index) => (
                  <div key={question.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                      initial={false}
                      animate={{ width: index < step ? "100%" : "0%" }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[128px] overflow-hidden">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={currentQuestion?.key}
                  custom={direction}
                  variants={swipeVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={swipeTransition}
                  className="w-full"
                >
                  {currentQuestion && (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`tutor-survey-${currentQuestion.key}`} className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {currentQuestion.label} <span className="text-red-500">*</span>
                      </label>
                      {currentQuestion.multiline ? (
                        <textarea
                          id={`tutor-survey-${currentQuestion.key}`}
                          autoFocus
                          value={answers[currentQuestion.key]}
                          onChange={(event) => updateAnswer(event.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={currentQuestion.placeholder}
                          rows={3}
                          className="focus-ring w-full resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors hover:border-zinc-300 focus:border-primary/50"
                        />
                      ) : (
                        <input
                          id={`tutor-survey-${currentQuestion.key}`}
                          autoFocus
                          type="text"
                          value={answers[currentQuestion.key]}
                          onChange={(event) => updateAnswer(event.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={currentQuestion.placeholder}
                          className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors hover:border-zinc-300 focus:border-primary/50"
                        />
                      )}
                      <p className="text-[11px] text-zinc-400">{currentQuestion.hint}</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-2">
              <Button variant="ghost" onClick={back} disabled={saving} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              <Button className="w-full gap-2" onClick={next} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : step === total ? <>Save &amp; start teaching <ChevronRight className="h-4 w-4" /></> : <>Next <ChevronRight className="h-4 w-4" /></>}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}