"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessibilityChoices } from "@/components/accessibility/accessibility-choices";
import { useAccessibility } from "@/components/layout/accessibility-provider";
import type { AccessibilityPrefs } from "@/lib/accessibility/preferences";
import { ChoiceChips } from "@/components/onboarding/choice-chips";
import { joinChoices, TUTOR_EXPERIENCE, TUTOR_PURPOSES, TUTOR_QUALIFICATIONS, TUTOR_SUBJECTS } from "@/lib/onboarding/choices";
import { stripJobTitle } from "@/lib/auth/job-title";

type QuestionKey = "expertise" | "qualification" | "experience" | "purpose";

/** Each question is answered by tapping options (src/lib/onboarding/choices.ts); "Other" takes a few words. */
type Question = {
  key: QuestionKey;
  label: string;
  options: string[];
  multiple: boolean;
  max?: number;
  otherPlaceholder: string;
  cleanOther?: (value: string) => string;
};

const QUESTIONS: Question[] = [
  // Saved as the profile's job title, which allows letters only and 80 characters (src/lib/auth/job-title.ts).
  { key: "expertise", label: "What do you teach?", options: TUTOR_SUBJECTS, multiple: true, max: 3, otherPlaceholder: "e.g. Chemistry", cleanOther: (v) => stripJobTitle(v).slice(0, 30) },
  { key: "qualification", label: "Your highest qualification", options: TUTOR_QUALIFICATIONS, multiple: false, otherPlaceholder: "e.g. Diploma in Education" },
  { key: "experience", label: "Teaching experience", options: TUTOR_EXPERIENCE, multiple: false, otherPlaceholder: "In a few words" },
  { key: "purpose", label: "Why did you choose Requisor?", options: TUTOR_PURPOSES, multiple: true, otherPlaceholder: "In a few words" },
];

type Answers = Record<QuestionKey, string>;
type Picks = Record<QuestionKey, string[]>;
const NO_PICKS: Picks = { expertise: [], qualification: [], experience: [], purpose: [] };
const NO_OTHER: Answers = { expertise: "", qualification: "", experience: "", purpose: "" };

export interface TutorSurveyProps {
  onSubmit?: (answers: Answers) => void | Promise<void>;
}

const swipeVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};
const swipeTransition = { duration: 0.18, ease: "easeOut" as const };

/** Step 1, right after the welcome: what would make the site easier to use (applies at once). */
const ACCESS_STEP = 1;

export default function TutorSurvey({ onSubmit }: TutorSurveyProps) {
  const accessibility = useAccessibility();
  const [a11y, setA11y] = useState<AccessibilityPrefs>(accessibility.prefs);
  // 0 = welcome, 1 = accessibility, 2.. = one question per step.
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [other, setOther] = useState<Answers>(NO_OTHER);
  const answerFor = (key: QuestionKey) => joinChoices(picks[key], other[key]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const total = QUESTIONS.length;
  const currentQuestion = step > ACCESS_STEP ? QUESTIONS[step - ACCESS_STEP - 1] : null;
  const lastStep = total + ACCESS_STEP;

  function changeA11y(next: AccessibilityPrefs) {
    setA11y(next);
    accessibility.preview(next);
  }

  function pick(key: QuestionKey, value: string[]) {
    setPicks((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  }
  function type(key: QuestionKey, value: string) {
    setOther((current) => ({ ...current, [key]: value }));
    if (error) setError("");
  }

  function next() {
    if (!currentQuestion) {
      if (step === ACCESS_STEP) accessibility.save(a11y).catch(() => {});
      setDirection(1);
      setStep((current) => current + 1);
      return;
    }

    if (!answerFor(currentQuestion.key).trim()) {
      setError("Pick an answer, or choose Other and type a few words.");
      return;
    }

    setError("");
    setDirection(1);
    if (step === lastStep) {
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


  async function submit() {
    setSaving(true);
    setError("");
    try {
      await onSubmit?.({
        expertise: answerFor("expertise"),
        qualification: answerFor("qualification"),
        experience: answerFor("experience"),
        purpose: answerFor("purpose"),
      });
    } catch {
      setError("We couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Set up your tutor profile" className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
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
              {total} quick questions — just tap your answers — so learners get the best guidance from you.
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
                <h2 className="text-lg font-bold text-zinc-900">{step === ACCESS_STEP ? "Make it easier to use" : "Quick tutor profile"}</h2>
                <span className="text-xs font-medium text-zinc-400">{step} / {lastStep}</span>
              </div>
              <div className="flex items-center gap-1.5" aria-label={`Step ${step} of ${lastStep}`}>
                {["access", ...QUESTIONS.map((question) => question.key)].map((key, index) => (
                  <div key={key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
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
                  key={currentQuestion?.key ?? "access"}
                  custom={direction}
                  variants={swipeVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={swipeTransition}
                  className="w-full"
                >
                  {step === ACCESS_STEP && (
                    <div className="space-y-2">
                      <p className="text-sm text-zinc-600">
                        Anything that would make the site easier for you to use? Pick any that help, or press Next. You can change these later in Settings.
                      </p>
                      <AccessibilityChoices prefs={a11y} onChange={changeA11y} columns={1} />
                    </div>
                  )}
                  {currentQuestion && (
                    <ChoiceChips
                      key={currentQuestion.key}
                      label={currentQuestion.label}
                      options={currentQuestion.options}
                      multiple={currentQuestion.multiple}
                      max={currentQuestion.max}
                      picked={picks[currentQuestion.key]}
                      onPickedChange={(value) => pick(currentQuestion.key, value)}
                      other={other[currentQuestion.key]}
                      onOtherChange={(value) => type(currentQuestion.key, value)}
                      otherPlaceholder={currentQuestion.otherPlaceholder}
                      cleanOther={currentQuestion.cleanOther}
                    />
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
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : step === lastStep ? <>Save &amp; start teaching <ChevronRight className="h-4 w-4" /></> : <>Next <ChevronRight className="h-4 w-4" /></>}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}