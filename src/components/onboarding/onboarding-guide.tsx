"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Loader2, ChevronRight, ChevronLeft, Check, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/components/assistant/persona-avatar";
import { DEFAULT_PERSONA_ID } from "@/lib/assistant/personas";
import { useVoice } from "@/hooks/use-voice";
import { useStore } from "@/lib/store";
import { scoreCourses } from "@/lib/ai/course-match";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { AccessibilityChoices } from "@/components/accessibility/accessibility-choices";
import { useAccessibility } from "@/components/layout/accessibility-provider";
import type { AccessibilityPrefs } from "@/lib/accessibility/preferences";
import { ChoiceChips } from "@/components/onboarding/choice-chips";
import { dateFromParts, joinChoices, LEARNER_BACKGROUNDS, LEARNER_REASONS, MONTHS } from "@/lib/onboarding/choices";

/**
 * A standalone, one-time (replayable) onboarding walkthrough — distinct from
 * the always-available chat assistant (src/components/assistant/ai-assistant.tsx) and the
 * anonymous landing widget (landing/components/TutorDemo.jsx). A large,
 * persistent on-screen persona narrates each step, replacing the plain form
 * that used to be here. Its look and the reply language aren't asked about
 * here; they can be changed later in the assistant.
 *
 * The second step asks what would make the site easier to use (larger text,
 * less motion, voice control...). Choices apply immediately, so the rest of the
 * walkthrough already uses them, and are saved to the account.
 */

interface Props {
  hasDob: boolean;
  onComplete: () => void;
  /** When retaking it from the profile: leave without changing anything. */
  onCancel?: () => void;
}

type StepKey = "welcome" | "access" | "qualification" | "goal" | "dob" | "recommend";

const MUTE_KEY = "onboarding-guide-muted";

export function OnboardingGuide({ hasDob, onComplete, onCancel }: Props) {
  const { state } = useStore();
  const voice = useVoice();
  const accessibility = useAccessibility();
  const [a11y, setA11y] = useState<AccessibilityPrefs>(accessibility.prefs);
  const [a11yTouched, setA11yTouched] = useState(false);
  // What's saved on the account, so exiting a retake can undo an unsaved preview.
  const savedA11yRef = useRef(accessibility.prefs);
  if (!a11yTouched) savedA11yRef.current = accessibility.prefs;
  // Steps switch instantly for "less motion" (chosen here, or set on the device).
  const deviceReducedMotion = useReducedMotion();
  const stepTransition = deviceReducedMotion || accessibility.prefs.reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" as const };
  // Replaying the walkthrough: start from what they chose before (it loads a moment after sign-in).
  useEffect(() => { if (!a11yTouched) setA11y(accessibility.prefs); }, [accessibility.prefs, a11yTouched]);

  const personaId = DEFAULT_PERSONA_ID;
  // Answers are picked, not typed (src/lib/onboarding/choices.ts); "Other" allows a few words.
  const [background, setBackground] = useState<string[]>([]);
  const [backgroundOther, setBackgroundOther] = useState("");
  const [reasons, setReasons] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [reasonOther, setReasonOther] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");
  const qualification = joinChoices(background, backgroundOther);
  // Saved as one sentence; the topics are course names, so they also steer the recommendation.
  const learningGoal = [joinChoices(reasons, reasonOther), topics.length ? `Interested in ${topics.join(", ")}` : ""].filter(Boolean).join(". ");
  const dob = dateFromParts(dobYear, dobMonth, dobDay);
  const thisYear = new Date().getFullYear();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(MUTE_KEY) === "true";
  });

  const steps: StepKey[] = useMemo(
    () => ["welcome", "access", "qualification", "goal", ...(!hasDob ? (["dob"] as StepKey[]) : []), "recommend"],
    [hasDob]
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const step = steps[stepIndex];

  const recommended = useMemo(() => {
    if (step !== "recommend") return null;
    const ranked = scoreCourses(state.courses, state.progress, { qualification, learningGoal });
    return ranked.find((match) => !match.completed) ?? null;
  }, [step, state.courses, state.progress, qualification, learningGoal]);

  const narration: Record<StepKey, string> = {
    welcome: "Hi — I'm your Requisor guide. I'll help you get set up and find the right path to start with. As you learn you'll earn XP and badges, and I'll keep track of your progress. It only takes a minute.",
    access: "Is there anything that would make the site easier for you to use? Pick any that help — they apply straight away, and you can change them later in Settings. If you're happy as it is, just press Next.",
    qualification: "Tell me a bit about your background — just tap what fits.",
    goal: "What brings you here, and what would you like to learn? Tap any that fit.",
    dob: "One more thing — your date of birth helps me pitch things at the right level. It's kept private.",
    recommend: recommended
      ? `Based on what you told me, I'd start with ${recommended.course.title}.`
      : "You're all set — pick any path from your dashboard whenever you're ready.",
  };

  // Speak the current step's narration once it's shown (unless muted).
  useEffect(() => {
    if (muted || !voice.ttsSupported) return;
    voice.speak(narration[step]);
    return () => voice.stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, muted, voice.ttsSupported, recommended?.course.slug]);

  function toggleMute() {
    setMuted((prev) => {
      const next = !prev;
      localStorage.setItem(MUTE_KEY, String(next));
      if (next) voice.stopSpeaking();
      return next;
    });
  }

  function validateStep(): string {
    if (step === "qualification" && !qualification.trim()) return "Pick what describes you best, or choose Other.";
    if (step === "goal" && !learningGoal.trim()) return "Pick at least one reason or topic.";
    if (step === "dob") {
      if (!dobYear || !dobMonth || !dobDay) return "Please choose your day, month and year of birth.";
      if (!dob) return "That date doesn't exist — please check the day.";
      if (new Date(dob) >= new Date()) return "Enter a valid past date of birth.";
    }
    return "";
  }

  function changeA11y(next: AccessibilityPrefs) {
    setA11y(next);
    setA11yTouched(true);
    accessibility.preview(next);
  }

  function goNext() {
    const msg = validateStep();
    if (msg) { setError(msg); return; }
    setError("");
    // Saved as soon as they move on, so the choice sticks even if they stop here.
    if (step === "access") { savedA11yRef.current = a11y; accessibility.save(a11y).catch(() => {}); }
    setDirection(1);
    if (stepIndex === steps.length - 1) {
      void submit();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function goBack() {
    setError("");
    setDirection(-1);
    setStepIndex((i) => Math.max(0, i - 1));
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
      // Again, in case the first save didn't go through.
      await accessibility.save(a11y).catch(() => {});
      trackEvent("onboarding_completed", {
        role: "learner",
        had_existing_dob: hasDob,
        accessibility_options: Object.values(a11y).filter(Boolean).length,
      });
      voice.stopSpeaking();
      onComplete();
    } catch {
      setError("Network error. Please try again.");
      setSaving(false);
    }
  }

  const avatarState = voice.isSpeaking ? "speaking" : "idle";
  const stepTitles: Record<StepKey, string> = {
    welcome: "Welcome",
    access: "Make it easier to use",
    qualification: "Your background",
    goal: "Your goal",
    dob: "Date of birth",
    recommend: "You're set",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-step-title"
        aria-describedby="onboarding-narration"
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="glass-card w-full max-w-2xl overflow-hidden p-6 sm:p-8"
      >
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-7">
          {/* Large, persistent on-screen character */}
          <div className="flex shrink-0 flex-col items-center gap-2">
            <PersonaAvatar personaId={personaId} size="xl" state={avatarState} />
            {voice.ttsSupported && (
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={!muted}
                className="focus-ring flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-500 transition hover:border-primary/40 hover:text-primary"
              >
                {muted ? <VolumeX className="h-3 w-3" aria-hidden="true" /> : <Volume2 className="h-3 w-3" aria-hidden="true" />}
                {muted ? "Voice off" : "Voice on"}
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="onboarding-step-title" className="text-lg font-bold text-zinc-900">{stepTitles[step]}</h2>
              <span className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                <span><span className="sr-only">Step </span>{stepIndex + 1}<span aria-hidden="true"> / </span><span className="sr-only"> of </span>{steps.length}</span>
                {onCancel && (
                  <button
                    type="button"
                    onClick={() => { voice.stopSpeaking(); accessibility.preview(savedA11yRef.current); onCancel(); }}
                    aria-label="Exit without saving"
                    title="Exit without saving"
                    className="focus-ring rounded-full p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </span>
            </div>
            <div className="mb-5 flex items-center gap-1.5" aria-hidden="true">
              {steps.map((s, i) => (
                <div key={s} className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                    initial={false}
                    animate={{ width: i <= stepIndex ? "100%" : "0%" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  />
                </div>
              ))}
            </div>

            {/* Speech bubble */}
            <div id="onboarding-narration" aria-live="polite" className="mb-4 rounded-2xl rounded-tl-sm border border-primary/15 bg-primary/[0.05] px-4 py-3 text-sm leading-relaxed text-zinc-800">
              {narration[step]}
            </div>

            <div className="relative min-h-[110px]">
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.div
                  key={step}
                  custom={direction}
                  initial={{ x: direction > 0 ? 60 : -60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: direction > 0 ? -60 : 60, opacity: 0 }}
                  transition={stepTransition}
                  className="w-full"
                >
                  {step === "welcome" && (
                    <div className="flex flex-wrap gap-2" role="list" aria-label="Learning paths">
                      {state.courses.map((c) => (
                        <span
                          key={c.slug}
                          role="listitem"
                          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
                        >
                          <span className={cn("h-2 w-2 rounded-full bg-gradient-to-br", c.cover)} />
                          {c.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {step === "access" && (
                    <AccessibilityChoices prefs={a11y} onChange={changeA11y} />
                  )}

                  {step === "qualification" && (
                    <ChoiceChips
                      label="What describes you best?"
                      multiple={false}
                      options={LEARNER_BACKGROUNDS}
                      picked={background}
                      onPickedChange={setBackground}
                      other={backgroundOther}
                      onOtherChange={setBackgroundOther}
                      otherPlaceholder="e.g. Nurse, Lawyer, MBA student"
                    />
                  )}

                  {step === "goal" && (
                    <div className="space-y-4">
                      <ChoiceChips
                        label="Why are you here?"
                        options={LEARNER_REASONS}
                        picked={reasons}
                        onPickedChange={setReasons}
                        other={reasonOther}
                        onOtherChange={setReasonOther}
                        otherPlaceholder="In a few words"
                      />
                      {state.courses.length > 0 && (
                        <ChoiceChips
                          label="Topics you'd like to learn (optional)"
                          options={state.courses.map((c) => c.title)}
                          picked={topics}
                          onPickedChange={setTopics}
                        />
                      )}
                    </div>
                  )}

                  {step === "dob" && (
                    <fieldset>
                      <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">Date of birth</legend>
                      <div className="grid grid-cols-[1fr_2fr_1.4fr] gap-2">
                        <select aria-label="Day" value={dobDay} onChange={(e) => setDobDay(e.target.value)} className="focus-ring h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 hover:border-zinc-300">
                          <option value="">Day</option>
                          {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                        </select>
                        <select aria-label="Month" value={dobMonth} onChange={(e) => setDobMonth(e.target.value)} className="focus-ring h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 hover:border-zinc-300">
                          <option value="">Month</option>
                          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                        <select aria-label="Year" value={dobYear} onChange={(e) => setDobYear(e.target.value)} className="focus-ring h-10 rounded-xl border border-zinc-200 bg-white px-2.5 text-sm text-zinc-900 hover:border-zinc-300">
                          <option value="">Year</option>
                          {Array.from({ length: 90 }, (_, i) => thisYear - 10 - i).map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </fieldset>
                  )}

                  {step === "recommend" && (
                    recommended ? (
                      <a
                        href={`/app/course/?slug=${recommended.course.slug}`}
                        className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-3 transition hover:border-primary/40"
                      >
                        <span className={cn("h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br", recommended.course.cover)} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-zinc-900">{recommended.course.title}</span>
                          <span className="block truncate text-xs text-zinc-500">{recommended.course.tagline}</span>
                        </span>
                      </a>
                    ) : (
                      <p className="text-sm text-zinc-600">Head to your dashboard to explore every path.</p>
                    )
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
                  role="alert"
                  className="mt-3 overflow-hidden rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="mt-6 flex gap-2">
              {stepIndex > 0 && (
                <Button variant="ghost" onClick={goBack} disabled={saving} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
              )}
              <Button className="flex-1 gap-2" onClick={goNext} disabled={saving}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : stepIndex === steps.length - 1 ? (
                  <>Save &amp; start learning <Check className="h-4 w-4" /></>
                ) : (
                  <>Next <ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
