"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  Gauge,
  GraduationCap,
  Info,
  Lightbulb,
  ListChecks,
  Loader2,
  Package,
  Repeat,
  RotateCcw,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { AssignmentSubmission } from "@/components/assignment-submission";
import {
  assignmentSummary,
  INSUFFICIENT_CONTENT_CODE,
  parseAssignment,
  type StructuredAssignment,
} from "@/lib/assignment-format";

const DIFFICULTY_TONE = { Beginner: "success", Intermediate: "warning", Advanced: "primary" } as const;
const DIFFICULTY_LEVEL = { Beginner: 1, Intermediate: 2, Advanced: 3 } as const;

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Why this brief suits the learner: the AI's note plus profile-sourced chips. */
function WhyForYou({ assignment: a, learnerName }: { assignment: StructuredAssignment; learnerName?: string }) {
  const t = a.tailoredTo;
  const chips = [
    t?.background && { Icon: GraduationCap, label: learnerName ? "Background" : "Your background", value: t.background },
    t?.goal && { Icon: Flag, label: learnerName ? "Goal" : "Your goal", value: t.goal },
    t?.reinforces?.length && { Icon: Repeat, label: "Reinforces", value: t.reinforces.join(", ") },
  ].filter(Boolean) as { Icon: typeof Flag; label: string; value: string }[];
  if (!a.whyForYou && chips.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/[0.07] to-primary/[0.02] p-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-primary">
        <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
        {learnerName ? `Why this fits ${learnerName}` : "Why this is for you"}
      </p>
      {a.whyForYou && <p className="mt-1.5 text-sm font-semibold leading-relaxed text-zinc-900">{a.whyForYou}</p>}
      {chips.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Tailored to">
          {chips.map(({ Icon, label, value }) => (
            <span
              key={label}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/20 bg-white px-2.5 py-0.5 text-xs text-zinc-700"
            >
              <Icon className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
              <span className="text-zinc-500">{label}:</span>
              <span className="truncate font-medium">{value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssignmentBrief({ assignment: a, learnerName }: { assignment: StructuredAssignment; learnerName?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-primary/15 bg-white">
      {/* Header: title + at-a-glance stats */}
      <div className="border-b border-primary/10 bg-gradient-to-r from-primary/[0.08] to-transparent p-4">
        <h4 className="text-base font-semibold text-zinc-900">{a.title}</h4>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Tag tone={DIFFICULTY_TONE[a.difficulty]}>
            <Gauge className="h-3 w-3" aria-hidden="true" />
            {a.difficulty}
            <span className="ml-0.5 inline-flex gap-0.5" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`h-1.5 w-1.5 rounded-full ${n <= DIFFICULTY_LEVEL[a.difficulty] ? "bg-current" : "bg-current opacity-25"}`}
                />
              ))}
            </span>
          </Tag>
          <Tag>
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatMinutes(a.estimatedMinutes)}
          </Tag>
          <Tag>
            <ListChecks className="h-3 w-3" aria-hidden="true" />
            {a.steps.length} steps
          </Tag>
        </div>
      </div>

      <div className="space-y-5 p-4">
        <WhyForYou assignment={a} learnerName={learnerName} />

        {a.scenario && (
          <p className="border-l-2 border-primary/40 pl-3 text-sm italic leading-relaxed text-zinc-600">{a.scenario}</p>
        )}

        <div className="flex gap-3 rounded-lg bg-primary/[0.05] p-3">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Your goal</p>
            <p className="mt-0.5 text-sm leading-relaxed text-zinc-800">{a.objective}</p>
          </div>
        </div>

        {/* Steps as a numbered timeline */}
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Steps</p>
          <ol className="space-y-0">
            {a.steps.map((step, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < a.steps.length - 1 && (
                  <span className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-primary/20" aria-hidden="true" />
                )}
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm font-medium text-zinc-900">{step.title}</p>
                  {step.detail && <p className="mt-0.5 text-sm leading-relaxed text-zinc-600">{step.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        {(a.deliverables.length > 0 || a.successCriteria.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {a.deliverables.length > 0 && (
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  <Package className="h-3.5 w-3.5" aria-hidden="true" />
                  What to hand in
                </p>
                <ul className="space-y-1.5">
                  {a.deliverables.map((d, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-700">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {a.successCriteria.length > 0 && (
              <div className="rounded-lg border border-zinc-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  You&apos;ve nailed it when
                </p>
                <ul className="space-y-1.5">
                  {a.successCriteria.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-700">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {a.tip && (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-amber-900">
              <span className="font-semibold">Pro tip: </span>
              {a.tip}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type AssignmentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; assignment: string; cached: boolean }
  | { status: "error"; message: string }
  /** The lesson is too thin to generate from; retrying won't help. */
  | { status: "unavailable"; message: string };

export function LessonAssignment({ lessonId, allowSubmission = false, curated = false, totalMarks, dueDate }: {
  lessonId: string; allowSubmission?: boolean;
  /** The tutor set this lesson's assignment to be written for each learner: it is the assignment, not optional practice. */
  curated?: boolean; totalMarks?: number; dueDate?: string;
}) {
  const [state, setState] = useState<AssignmentState>({ status: "idle" });

  useEffect(() => {
    const aborter = new AbortController();
    setState({ status: "idle" });

    async function loadSavedAssignment() {
      try {
        const response = await fetch(`/api/assignment?lessonId=${encodeURIComponent(lessonId)}`, {
          signal: aborter.signal,
        });
        if (response.status === 404 || aborter.signal.aborted) return;

        const data = (await response.json().catch(() => ({}))) as {
          assignment?: string;
          cached?: boolean;
          error?: string;
        };
        if (!response.ok || !data.assignment) {
          throw new Error(data.error || "Couldn't load your saved assignment.");
        }
        setState({ status: "ready", assignment: data.assignment, cached: Boolean(data.cached) });
      } catch (error) {
        if (aborter.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Couldn't load your saved assignment.",
        });
      }
    }

    void loadSavedAssignment();
    return () => aborter.abort();
  }, [lessonId]);

  async function loadAssignment() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The server resolves all lesson content from this identifier.
        body: JSON.stringify({ lessonId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        assignment?: string;
        cached?: boolean;
        error?: string;
        code?: string;
      };
      if (data.code === INSUFFICIENT_CONTENT_CODE && data.error) {
        setState({ status: "unavailable", message: data.error });
        return;
      }
      if (!response.ok || !data.assignment) {
        throw new Error(data.error || "Couldn't prepare an assignment right now.");
      }
      setState({ status: "ready", assignment: data.assignment, cached: Boolean(data.cached) });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Couldn't prepare an assignment right now.",
      });
    }
  }

  const structured = state.status === "ready" ? parseAssignment(state.assignment) : null;

  return (
    <Card className="border-primary/15 bg-primary/[0.03] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {curated ? "Your assignment" : "Practice assignment"}
          </CardTitle>
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            {curated
              ? "Your tutor set this up so everyone gets their own version. Yours is written for you and stays the same once it's created."
              : "Turn this lesson into a practical task tailored to your learning profile."}
          </p>
        </div>

        {state.status !== "ready" && state.status !== "unavailable" && (
          <Button
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            disabled={state.status === "loading"}
            onClick={loadAssignment}
          >
            {state.status === "loading" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Preparing…
              </>
            ) : (
              <>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {curated ? "Get my assignment" : "Get assignment"}
              </>
            )}
          </Button>
        )}
      </div>

      {state.status === "loading" && (
        <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-sm text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          Creating your practical assignment…
        </div>
      )}

      {state.status === "error" && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-red-700">{state.message}</p>
          <Button size="sm" variant="outline" className="shrink-0" onClick={loadAssignment}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {state.status === "unavailable" && (
        <div role="status" className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-amber-900">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && (
        <div className="mt-4 space-y-4">
          {structured ? (
            <AssignmentBrief assignment={structured} />
          ) : (
            <div className="rounded-xl border border-primary/15 bg-white p-4">
              <p className="text-sm leading-relaxed text-zinc-800">{state.assignment}</p>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            {state.cached ? "Your saved assignment for this lesson." : "Saved for your next visit to this lesson."}
          </p>
          {allowSubmission && (
            <AssignmentSubmission lessonId={lessonId} assignmentBrief={assignmentSummary(state.assignment)} totalMarks={totalMarks} dueDate={dueDate} />
          )}
        </div>
      )}
    </Card>
  );
}