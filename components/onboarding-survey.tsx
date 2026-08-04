"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  hasDob: boolean; // true if DOB already set — skip that field
  onComplete: () => void;
}

export function OnboardingSurvey({ hasDob, onComplete }: Props) {
  const [step, setStep] = useState(0); // 0 = welcome, 1 = form, 2 = saving
  const [qualification, setQualification] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!qualification.trim()) { setError("Please tell us your qualification."); return; }
    if (!learningGoal.trim()) { setError("Please tell us why you're here."); return; }
    if (!hasDob && !dob) { setError("Please enter your date of birth."); return; }
    if (!hasDob && dob) {
      const d = new Date(dob);
      if (isNaN(d.getTime()) || d >= new Date()) { setError("Enter a valid past date of birth."); return; }
    }

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <AnimatePresence mode="wait">
        {step === 0 ? (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.25 }}
            className="glass-card w-full max-w-md p-8 text-center"
          >
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary shadow-glow">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-zinc-900">Personalise your learning</h2>
            <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
              Answer 3 quick questions so we can tailor quiz difficulty and assignments to your background and goals.
            </p>
            <Button className="mt-6 w-full gap-2" onClick={() => setStep(1)}>
              Let's go <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.25 }}
            className="glass-card w-full max-w-md p-8"
          >
            <div className="mb-6">
              <h2 className="text-lg font-bold text-zinc-900">Quick profile setup</h2>
              <p className="mt-1 text-xs text-zinc-500">Takes under a minute — helps us personalise everything for you.</p>
            </div>

            <div className="space-y-4">
              {/* Qualification */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Your qualification / background <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={qualification}
                  onChange={(e) => setQualification(e.target.value)}
                  placeholder="e.g. Software Engineer, Doctor, MBA, Teacher…"
                  className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition hover:border-zinc-300"
                />
              </div>

              {/* Learning goal */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Why are you here? <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={learningGoal}
                  onChange={(e) => setLearningGoal(e.target.value)}
                  placeholder="e.g. Upskill for promotion, understand AI tools, grow my team…"
                  className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition hover:border-zinc-300"
                />
              </div>

              {/* DOB — only if not already set */}
              {!hasDob && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Date of birth <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className="focus-ring rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 transition hover:border-zinc-300"
                  />
                  <p className="text-[11px] text-zinc-400">Used to calibrate content complexity — kept private.</p>
                </div>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-3.5 py-2 text-sm text-red-600">{error}</p>
            )}

            <Button
              className="mt-6 w-full gap-2"
              onClick={submit}
              disabled={saving}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <>Save &amp; start learning <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
