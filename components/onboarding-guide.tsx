"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronRight, ChevronLeft, Check, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/components/persona-avatar";
import { PERSONAS, LANGUAGES, DEFAULT_PERSONA_ID, getPersona } from "@/lib/personas";
import { useVoice } from "@/hooks/use-voice";
import { useStore } from "@/lib/store";
import { scoreCourses } from "@/lib/course-match";
import { cn } from "@/lib/utils";

/**
 * A standalone, one-time (replayable) onboarding walkthrough — distinct from
 * the always-available chat assistant (components/ai-assistant.tsx) and the
 * anonymous landing widget (landing/components/TutorDemo.jsx). A large,
 * persistent on-screen persona narrates each step, replacing the plain form
 * that used to be here; the persona itself is picked by the user, not
 * inferred from anything about them (see lib/personas.ts).
 */

interface Props {
  hasDob: boolean;
  onComplete: () => void;
}

type StepKey = "welcome" | "tour" | "persona" | "qualification" | "goal" | "dob" | "recommend";

const MUTE_KEY = "onboarding-guide-muted";

export function OnboardingGuide({ hasDob, onComplete }: Props) {
  const { state } = useStore();
  const voice = useVoice();

  const [personaId, setPersonaId] = useState(DEFAULT_PERSONA_ID);
  const [language, setLanguage] = useState("");
  const [qualification, setQualification] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [muted, setMuted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(MUTE_KEY) === "true";
  });

  const steps: StepKey[] = useMemo(
    () => ["welcome", "tour", "persona", "qualification", "goal", ...(!hasDob ? (["dob"] as StepKey[]) : []), "recommend"],
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
    welcome: "Hi — I'm your Requisor guide. I'll help you get set up and find the right path to start with. It only takes a minute.",
    tour: "Requisor Learning has four tracks: Product Management, Data Analytics, Agentic AI, and Cyber Security. As you go you'll earn XP and badges, and I'll keep track of your progress so I can pick up right where you left off.",
    persona: "First, make it yours — pick how I should look, and which language you'd like me to use.",
    qualification: "Tell me a bit about your background.",
    goal: "And what brings you here — what are you hoping to get out of Requisor Learning?",
    dob: "One more thing — your date of birth helps calibrate content complexity. It's kept private.",
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
    if (step === "qualification" && !qualification.trim()) return "Please tell us your qualification.";
    if (step === "goal" && !learningGoal.trim()) return "Please tell us why you're here.";
    if (step === "dob") {
      if (!dob) return "Please enter your date of birth.";
      const d = new Date(dob);
      if (isNaN(d.getTime()) || d >= new Date()) return "Enter a valid past date of birth.";
    }
    return "";
  }

  function goNext() {
    const msg = validateStep();
    if (msg) { setError(msg); return; }
    setError("");
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); goNext(); }
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
          assistantPersona: personaId,
          preferredLanguage: language || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Something went wrong. Please try again.");
        setSaving(false);
        return;
      }
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
    tour: "What's here",
    persona: "Make it yours",
    qualification: "Your background",
    goal: "Your goal",
    dob: "Date of birth",
    recommend: "You're set",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <motion.div
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
                className="focus-ring flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-500 transition hover:border-primary/40 hover:text-primary"
              >
                {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                {muted ? "Voice off" : "Voice on"}
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">{stepTitles[step]}</h2>
              <span className="text-xs font-medium text-zinc-400">{stepIndex + 1} / {steps.length}</span>
            </div>
            <div className="mb-5 flex items-center gap-1.5">
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
            <div className="mb-4 rounded-2xl rounded-tl-sm border border-primary/15 bg-primary/[0.05] px-4 py-3 text-sm leading-relaxed text-zinc-800">
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
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  className="w-full"
                >
                  {step === "welcome" && (
                    <p className="text-sm text-zinc-600">Let&apos;s get you set up — it only takes a minute.</p>
                  )}

                  {step === "tour" && (
                    <div className="flex flex-wrap gap-2">
                      {state.courses.map((c) => (
                        <span
                          key={c.slug}
                          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
                        >
                          <span className={cn("h-2 w-2 rounded-full bg-gradient-to-br", c.cover)} />
                          {c.title}
                        </span>
                      ))}
                    </div>
                  )}

                  {step === "persona" && (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Appearance</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                          {PERSONAS.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setPersonaId(p.id)}
                             aria-pressed={personaId === p.id}
                              className={cn(
                                "flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-colors",
                                personaId === p.id ? "border-primary bg-primary/5" : "border-transparent bg-zinc-50 hover:border-zinc-200"
                              )}
                            >
                              <PersonaAvatar personaId={p.id} size="sm" />
                              <span className="text-[10px] font-medium text-zinc-600">{p.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Language
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value)}
                          className="focus-ring mt-1 block h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900"
                        >
                          <option value="">English (default)</option>
                          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                        </select>
                      </label>
                    </div>
                  )}

                  {step === "qualification" && (
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

                  {step === "goal" && (
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

                  {step === "dob" && (
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
                    </div>
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
                      <p className="text-sm text-zinc-600">Head to your dashboard to explore all four paths.</p>
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
