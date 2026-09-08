"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, ClipboardList, Clock, FileText, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageTransition } from "@/components/motion";
import { DocumentMarkupViewer } from "@/components/document-markup-viewer";

interface RubricCriterion {
  id: number;
  title: string;
  description: string | null;
  maxPoints: number;
  score: number | null;
}
interface Detail {
  submission: {
    id: number; studentName: string; studentEmail: string; fileName: string; mimeType: string;
    fileSize: number; submittedAt: string; lessonId: string; lessonTitle: string;
    courseSlug: string; courseTitle: string;
  };
  marks: number | null;
  rawScore: number | null;
  rawMax: number | null;
  gradedAt: string | null;
  rubric: RubricCriterion[];
  stats: { total: number; checked: number; averageMarks: number | null };
}
function applyGradeResult(prev: Detail, marks: number, rawScore: number | null, rawMax: number | null, gradedAt: string): Detail {
  return {
    ...prev,
    marks, rawScore, rawMax, gradedAt,
    stats: prev.marks === null
      ? {
          total: prev.stats.total,
          checked: prev.stats.checked + 1,
          averageMarks: prev.stats.checked === 0
            ? marks
            : Math.round((((prev.stats.averageMarks ?? 0) * prev.stats.checked) + marks) / (prev.stats.checked + 1) * 10) / 10,
        }
      : prev.stats,
  };
}
interface SubmissionSummary {
  id: number;
  studentName: string;
  fileName: string;
  submittedAt: string;
  marks: number | null;
  lessonTitle: string;
  courseTitle: string;
}

/* ---------- motion presets ---------- */
const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 30 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

/* ---------- small UI pieces ---------- */
function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5 text-sm font-semibold text-primary ring-1 ring-primary/20">
      {initials}
    </div>
  );
}

function StatusPill({ marks }: { marks: number | null }) {
  if (marks === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Needs checking
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/10">
      <CheckCircle2 className="h-3.5 w-3.5" />
      {marks}% · Checked
    </span>
  );
}

function BackLink() {
  return (
    <Link href="/app/tutor/" className="group inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-800">
      <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
      Back to tutor panel
    </Link>
  );
}

function SaveButton({ saving, saved, label, onClick, disabled }: { saving: boolean; saved: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.div whileHover={{ scale: disabled ? 1 : 1.02 }} whileTap={{ scale: disabled ? 1 : 0.97 }}>
      <Button size="sm" onClick={onClick} disabled={disabled} className="relative min-w-[7.5rem] overflow-hidden shadow-sm">
        <AnimatePresence mode="wait" initial={false}>
          {saving ? (
            <motion.span key="saving" className="flex items-center gap-1.5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </motion.span>
          ) : saved ? (
            <motion.span key="saved" className="flex items-center gap-1.5" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </motion.span>
          ) : (
            <motion.span key="idle" className="flex items-center gap-1.5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
              <Save className="h-3.5 w-3.5" /> {label}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>
    </motion.div>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          role="alert"
          key={message}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          initial={{ opacity: 0, height: 0, x: 0 }}
          animate={{ opacity: 1, height: "auto", x: [0, -4, 4, -3, 3, 0] }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.35 }}
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-white p-4" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="h-10 w-10 animate-pulse rounded-full bg-zinc-100" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-zinc-100" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="h-6 w-24 animate-pulse rounded-full bg-zinc-100" />
        </div>
      ))}
    </div>
  );
}

/* ---------- inbox ---------- */
function SubmissionInbox() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const aborter = new AbortController();
    fetch("/api/tutor/assignment-submissions", { signal: aborter.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { submissions?: SubmissionSummary[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Couldn't load assignment submissions.");
        setSubmissions(data.submissions ?? []);
      })
      .catch((cause) => {
        if (!aborter.signal.aborted) setError(cause instanceof Error ? cause.message : "Couldn't load assignment submissions.");
      });
    return () => aborter.abort();
  }, []);

  const pending = submissions?.filter((s) => s.marks === null).length ?? 0;
  const checked = (submissions?.length ?? 0) - pending;

  return (
    <PageTransition>
      <div className="space-y-5">
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-white via-white to-primary/5 p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
          <BackLink />
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-900">
                <ClipboardList className="h-5 w-5 text-primary" />
                Assignment submissions
              </h1>
              <p className="mt-1 text-sm text-zinc-500">Open a learner submission to review, annotate, and grade it.</p>
            </div>
            {submissions && submissions.length > 0 && (
              <div
                className="w-full overflow-hidden rounded-xl border border-primary/15 bg-white/80 shadow-sm ring-1 ring-primary/5 sm:w-auto"
                aria-label={`Assignment review progress: ${pending} pending, ${checked} of ${submissions.length} checked`}
              >
                <div className="flex items-stretch">
                  <div className="flex min-w-0 items-center gap-2.5 border-l-4 border-amber-400 px-3 py-2.5 sm:px-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700" aria-hidden>
                      <Clock className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">To review</p>
                      <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums text-zinc-900">
                        {pending} pending
                      </p>
                    </div>
                  </div>
                  <div className="my-2.5 w-px bg-primary/10" aria-hidden />
                  <div className="flex min-w-0 items-center gap-2.5 border-l-4 border-primary px-3 py-2.5 sm:px-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Progress</p>
                      <p className="mt-0.5 whitespace-nowrap text-sm font-semibold tabular-nums text-zinc-900">
                        {checked} of {submissions.length} checked
                      </p>
                    </div>
                  </div>
                </div>
                <div className="h-1 bg-primary/10" role="progressbar" aria-label="Submissions checked" aria-valuemin={0} aria-valuemax={submissions.length} aria-valuenow={checked}>
                  <div className="h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${(checked / submissions.length) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {error && <Card className="p-5"><ErrorNote message={error} /></Card>}
        {!error && submissions === null && <SkeletonRows />}

        {submissions?.length === 0 && (
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <Card className="p-10 text-center">
              <motion.div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-50 ring-1 ring-zinc-200"
                animate={{ y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
              >
                <FileText className="h-7 w-7 text-zinc-400" />
              </motion.div>
              <p className="mt-4 font-medium text-zinc-900">No submissions yet</p>
              <p className="mt-1 text-sm text-zinc-500">Learner uploads will appear here.</p>
            </Card>
          </motion.div>
        )}

        {submissions && submissions.length > 0 && (
          <motion.div className="space-y-2" variants={listVariants} initial="hidden" animate="show">
            {submissions.map((submission) => (
              <motion.div key={submission.id} variants={itemVariants} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                <Link href={`/app/tutor/assignment/?submissionId=${submission.id}`} className="group block">
                  <Card className={`flex flex-col gap-3 border-l-4 p-4 transition-all hover:border-primary/40 hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${submission.marks === null ? "border-l-primary/60" : "border-l-emerald-500/60"}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={submission.studentName} />
                      <div className="min-w-0">
                        <p className="font-medium text-zinc-900 transition-colors group-hover:text-primary">{submission.studentName}</p>
                        <p className="truncate text-sm text-zinc-600">{submission.lessonTitle} · {submission.courseTitle}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                          <FileText className="h-3 w-3" />
                          <span className="truncate">{submission.fileName}</span>
                          <span>·</span>
                          <span>{new Date(submission.submittedAt).toLocaleString()}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 sm:shrink-0">
                      <StatusPill marks={submission.marks} />
                      <ArrowLeft className="h-4 w-4 rotate-180 text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}

/* ---------- grade view ---------- */
function GradeView() {
  const submissionIdParam = useSearchParams().get("submissionId");
  const submissionId = Number(submissionIdParam);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marksInput, setMarksInput] = useState("");
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [savingGrade, setSavingGrade] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => {
    if (!submissionIdParam) return;
    if (!Number.isSafeInteger(submissionId) || submissionId < 1) {
      setError("Invalid submission.");
      return;
    }
    let cancelled = false;
    fetch(`/api/tutor/assignment-submissions/detail?submissionId=${submissionId}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as Detail & { error?: string };
        if (!r.ok) throw new Error((data as { error?: string }).error || "Couldn't load this submission.");
        if (!cancelled) {
          setDetail(data);
          setMarksInput(data.marks !== null && data.rubric.length === 0 ? String(data.marks) : "");
          setScoreInputs(Object.fromEntries(data.rubric.map((c) => [c.id, c.score !== null ? String(c.score) : ""])));
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this submission."); });
    return () => { cancelled = true; };
  }, [submissionId, submissionIdParam]);
  if (!submissionIdParam) return <SubmissionInbox />;

  async function saveFlatMarks() {
    if (!detail) return;
    const marks = Number(marksInput);
    if (!Number.isFinite(marks) || marks < 0 || marks > 100) {
      setError("Marks must be a number between 0 and 100.");
      return;
    }
    setSavingGrade(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor/assignment-submissions/grade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: detail.submission.id, marks }),
      });
      const data = (await res.json().catch(() => ({}))) as { marks?: number; gradedAt?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save marks.");
      setDetail((prev) => prev && applyGradeResult(prev, data.marks ?? marks, null, null, data.gradedAt ?? new Date().toISOString()));
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save marks.");
    } finally {
      setSavingGrade(false);
    }
  }
  async function saveRubricScores() {
    if (!detail) return;
    const scores = detail.rubric.map((c) => ({ criterionId: c.id, score: Number(scoreInputs[c.id]) }));
    if (scores.some((s) => !Number.isFinite(s.score) || s.score < 0)) {
      setError("Enter a score for every criterion.");
      return;
    }
    for (const c of detail.rubric) {
      const score = Number(scoreInputs[c.id]);
      if (score > c.maxPoints) {
        setError(`"${c.title}" can't exceed ${c.maxPoints} points.`);
        return;
      }
    }
    setSavingGrade(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor/assignment-submissions/grade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: detail.submission.id, scores }),
      });
      const data = (await res.json().catch(() => ({}))) as { marks?: number; rawScore?: number; rawMax?: number; gradedAt?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save the grade.");
      setDetail((prev) => prev && applyGradeResult(
        prev, data.marks ?? 0, data.rawScore ?? null, data.rawMax ?? null, data.gradedAt ?? new Date().toISOString()
      ));
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the grade.");
    } finally {
      setSavingGrade(false);
    }
  }
  function flashSaved() {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  if (error && !detail) {
    return (
      <PageTransition>
        <Card className="p-6"><ErrorNote message={error} /></Card>
      </PageTransition>
    );
  }
  if (!detail) {
    return (
      <PageTransition>
        <div className="space-y-4">
          <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
          <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
          <div className="flex items-center gap-2 px-1 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading submission…</div>
        </div>
      </PageTransition>
    );
  }

  const { submission, stats, rubric } = detail;
  const hasRubric = rubric.length > 0;
  const runningTotal = hasRubric
    ? rubric.reduce((sum, c) => sum + (Number(scoreInputs[c.id]) || 0), 0)
    : null;
  const runningMax = hasRubric ? rubric.reduce((sum, c) => sum + c.maxPoints, 0) : null;
  const runningPct = runningMax ? Math.round(((runningTotal ?? 0) / runningMax) * 1000) / 10 : 0;
  const checkedPct = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;
  const filledCount = hasRubric ? rubric.filter((c) => (scoreInputs[c.id] ?? "").trim() !== "").length : 0;

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* header */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <BackLink />
            <div className="mt-3 flex items-center gap-3">
              <Avatar name={submission.studentName} />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-zinc-900">{submission.studentName}</h1>
                <p className="truncate text-sm text-zinc-500">
                  {submission.lessonTitle} · {submission.courseTitle}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1"><FileText className="h-3 w-3" />{submission.fileName}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1"><Clock className="h-3 w-3" />{new Date(submission.submittedAt).toLocaleString()}</span>
              <AnimatePresence>
                {detail.marks !== null && (
                  <motion.span key="graded" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                    <StatusPill marks={detail.marks} />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>

          <Card className="min-w-[15rem] overflow-hidden px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-zinc-400">Checked</p>
                <p className="text-base font-semibold tabular-nums text-zinc-900">
                  <AnimatedNumber value={stats.checked} /> <span className="text-sm font-normal text-zinc-400">/ {stats.total}</span>
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-zinc-400">Avg. marks</p>
                <p className="text-base font-semibold tabular-nums text-zinc-900">{stats.averageMarks !== null ? `${stats.averageMarks}%` : "—"}</p>
              </div>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
                initial={{ width: 0 }}
                animate={{ width: `${checkedPct}%` }}
                transition={{ type: "spring", stiffness: 80, damping: 20 }}
              />
            </div>
          </Card>
        </motion.div>

        {/* grading card */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.08 }}>
          <Card className="space-y-3 p-4">
            {hasRubric ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <Sparkles className="h-4 w-4 text-primary" /> Rubric
                  </p>
                  <span className="text-xs text-zinc-500">{filledCount} / {rubric.length} scored</span>
                </div>
                <motion.ul className="space-y-2" variants={listVariants} initial="hidden" animate="show">
                  {rubric.map((c) => {
                    const val = Number(scoreInputs[c.id]);
                    const filled = (scoreInputs[c.id] ?? "").trim() !== "";
                    const over = filled && val > c.maxPoints;
                    const pct = filled && c.maxPoints > 0 ? Math.min(100, Math.max(0, (val / c.maxPoints) * 100)) : 0;
                    return (
                      <motion.li
                        key={c.id}
                        variants={itemVariants}
                        className={`group relative overflow-hidden rounded-xl border p-3 transition-colors focus-within:border-primary/50 focus-within:bg-primary/[0.03] ${over ? "border-red-300 bg-red-50/40" : filled ? "border-emerald-200/70" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900">{c.title}</p>
                            {c.description && <p className="mt-0.5 text-xs text-zinc-500">{c.description}</p>}
                          </div>
                          <label className="flex shrink-0 items-center gap-1 text-sm text-zinc-600">
                            <Input
                              type="number" min={0} max={c.maxPoints}
                              value={scoreInputs[c.id] ?? ""}
                              onChange={(e) => setScoreInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                              className={`h-9 w-16 text-right tabular-nums transition-shadow focus-visible:ring-primary/40 ${over ? "border-red-400 text-red-700" : ""}`}
                              aria-label={`Score for ${c.title}`}
                            />
                            <span className="tabular-nums">/ {c.maxPoints}</span>
                          </label>
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-100">
                          <motion.div
                            className={`h-full ${over ? "bg-red-400" : "bg-emerald-500"}`}
                            initial={false}
                            animate={{ width: `${over ? 100 : pct}%` }}
                            transition={{ type: "spring", stiffness: 120, damping: 22 }}
                          />
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <div className="flex items-center gap-3">
                    <ProgressRing pct={runningPct} />
                    <p className="text-sm text-zinc-700">
                      Total: <span className="font-semibold tabular-nums"><AnimatedNumber value={runningTotal ?? 0} /> / {runningMax}</span>
                      {runningMax ? <span className="tabular-nums text-zinc-500"> ({runningPct}%)</span> : null}
                    </p>
                  </div>
                  <SaveButton saving={savingGrade} saved={savedFlash} label="Save grade" onClick={() => void saveRubricScores()} disabled={savingGrade} />
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                  Marks (0–100)
                  <Input
                    type="number" min={0} max={100} value={marksInput}
                    onChange={(e) => setMarksInput(e.target.value)}
                    className="h-9 w-24 tabular-nums transition-shadow focus-visible:ring-primary/40"
                  />
                </label>
                <SaveButton saving={savingGrade} saved={savedFlash} label="Save marks" onClick={() => void saveFlatMarks()} disabled={savingGrade || !marksInput.trim()} />
                <span className="text-xs text-zinc-500">No rubric set up for this lesson — set one from the lesson editor to grade by criteria instead.</span>
              </div>
            )}
            <AnimatePresence>
              {detail.gradedAt && (
                <motion.span key={detail.gradedAt} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="block text-xs text-zinc-500">
                  Last graded {new Date(detail.gradedAt).toLocaleString()}
                </motion.span>
              )}
            </AnimatePresence>
            <ErrorNote message={error} />
          </Card>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.16 }}>
          <DocumentMarkupViewer submissionId={submission.id} mimeType={submission.mimeType} />
        </motion.div>
      </div>
    </PageTransition>
  );
}

/* ---------- animated numerics ---------- */
function AnimatedNumber({ value }: { value: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        className="inline-block"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="-rotate-90 shrink-0" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-zinc-100" />
      <motion.circle
        cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" strokeLinecap="round"
        className={clamped >= 100 ? "stroke-emerald-500" : "stroke-primary"}
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c - (c * clamped) / 100 }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
      />
    </svg>
  );
}

export default function GradeSubmissionPage() {
  return (
    <Suspense>
      <GradeView />
    </Suspense>
  );
}