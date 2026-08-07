"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  hasDob: boolean; // true if DOB already set — skip that field
  onComplete: () => void;
}

type QuestionKey = "qualification" | "goal" | "dob";

const swipeVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
};
const swipeTransition = { type: "spring" as const, stiffness: 320, damping: 30 };

export function OnboardingSurvey({ hasDob, onComplete }: Props) {
  const [step, setStep] = useState(0); // 0 = welcome, 1..N = one question per step
  const [direction, setDirection] = useState(1);
  const [qualification, setQualification] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const questions: { key: QuestionKey; label: string; hint?: string }[] = [
    { key: "qualification", label: "Your qualification / background" },
    { key: "goal", label: "Why are you here?" },
    ...(!hasDob ? [{ key: "dob" as const, label: "Date of birth", hint: "Used to calibrate content complexity — kept private." }] : []),
  ];
  const total = questions.length;
  const currentQuestion = step >= 1 ? questions[step - 1] : null;

  function validateStep(q: QuestionKey): string {
    if (q === "qualification" && !qualification.trim()) return "Please tell us your qualification.";
    if (q === "goal" && !learningGoal.trim()) return "Please tell us why you're here.";
    if (q === "dob") {
      if (!dob) return "Please enter your date of birth.";
      const d = new Date(dob);
      if (isNaN(d.getTime()) || d >= new Date()) return "Enter a valid past date of birth.";
    }
    return "";
  }

  function goNext() {
    if (currentQuestion) {
      const msg = validateStep(currentQuestion.key);
      if (msg) { setError(msg); return; }
    }
    setError("");
    setDirection(1);
    if (step === total) {
      submit();
    } else {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    setError("");
    setDirection(-1);
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qualification: qualification.trim(),
          learningGoal: learningGoal.trim(),
          dateOfBirth: !hasDob ? dob : undefined,
          onboardingDone: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        setSaving(false);
        return;
      }
      onComplete();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); goNext(); }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
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
            <h2 className="text-xl font-bold text-zinc-900">Personalise your learning</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Answer {total} quick question{total !== 1 ? "s" : ""} so we can tailor quiz difficulty and assignments to your background and goals.
            </p>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button className="mt-6 w-full gap-2" onClick={() => { setDirection(1); setStep(1); }}>
                Let's go <ChevronRight className="h-4 w-4" />
              </Button>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="form-shell"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.25 }}
            className="glass-card w-full max-w-md overflow-hidden p-8"
          >
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-zinc-900">Quick profile setup</h2>
                <span className="text-xs font-medium text-zinc-400">{step} / {total}</span>
              </div>
              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {questions.map((q, i) => (
                  <div key={q.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                      initial={false}
                      animate={{ width: i < step ? "100%" : "0%" }}
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
                  {currentQuestion?.key === "qualification" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Your qualification / background <span className="text-red-500">*</span>
                      </label>
                      <input
                        autoFocus
                        type="text"
                        value={qualification}
                        onChange={(e) => setQualification(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g. Software Engineer, Doctor, MBA, Teacher…"
                        className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors hover:border-zinc-300 focus:border-primary/50"
                      />
                    </div>
                  )}
                  {currentQuestion?.key === "goal" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Why are you here? <span className="text-red-500">*</span>
                      </label>
                      <input
                        autoFocus
                        type="text"
                        value={learningGoal}
                        onChange={(e) => setLearningGoal(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g. Upskill for promotion, understand AI tools, grow my team…"
                        className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors hover:border-zinc-300 focus:border-primary/50"
                      />
                    </div>
                  )}
                  {currentQuestion?.key === "dob" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Date of birth <span className="text-red-500">*</span>
                      </label>
                      <input
                        autoFocus
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        onKeyDown={handleKeyDown}
                        max={new Date().toISOString().slice(0, 10)}
                        className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 transition-colors hover:border-zinc-300 focus:border-primary/50"
                      />
                      {currentQuestion.hint && <p className="text-[11px] text-zinc-400">{currentQuestion.hint}</p>}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="mt-6 flex gap-2">
              {step > 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button variant="ghost" onClick={goBack} disabled={saving} className="gap-1">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                </motion.div>
              )}
              <motion.div className="flex-1" whileHover={{ scale: saving ? 1 : 1.01 }} whileTap={{ scale: saving ? 1 : 0.99 }}>
                <Button className="w-full gap-2" onClick={goNext} disabled={saving}>
                  <AnimatePresence mode="wait" initial={false}>
                    {saving ? (
                      <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                      </motion.span>
                    ) : step === total ? (
                      <motion.span key="finish" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        Save &amp; start learning <ChevronRight className="h-4 w-4" />
                      </motion.span>
                    ) : (
                      <motion.span key="next" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                        Next <ChevronRight className="h-4 w-4" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}