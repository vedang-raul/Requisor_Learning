"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, FileText, Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageTransition } from "@/components/motion";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { DocumentMarkupViewer } from "@/components/document-markup-viewer";
import { AssignmentBrief } from "@/components/lesson-assignment";
import { SubmissionSourceBadge } from "@/components/submission-source-badge";
import { DATA_CHANGED_EVENT } from "@/components/assistant-action-card";
import { parseAssignment } from "@/lib/assignment-format";
import type { SubmissionSource } from "@/lib/submission-source";

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
    dueDate: string | null; totalMarks: number | null;
    source: SubmissionSource;
    /** The learner's AI-generated brief (AI practice submissions only). */
    assignmentBrief: string | null;
    /** The lesson's own assignment text (tutor assignment submissions only). */
    tutorAssignment: string | null;
  };
  marks: number | null;
  rawScore: number | null;
  rawMax: number | null;
  gradedAt: string | null;
  remark: string | null;
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
/** Optional statuses a tutor can put on a grade. Anything else saved earlier (old quality remarks) reads as none. */
const GRADE_STATUSES = ["Late", "Missing", "Excused"];
const savedStatus = (d: Detail) => (d.remark && GRADE_STATUSES.includes(d.remark) ? d.remark : "");
/** How long the grader waits after the last change before saving on its own. */
const AUTOSAVE_DELAY_MS = 1500;
/** What a no-rubric grade is out of: the lesson's total points, or 100 when it sets none. */
const pointsTotal = (d: Detail) => d.submission.totalMarks ?? 100;
/** The saved grade as points out of that total ("" when ungraded). Older grades were stored as a percentage only. */
function savedPoints(d: Detail): string {
  if (d.marks === null) return "";
  const total = pointsTotal(d);
  return String(d.rawScore !== null && d.rawMax === total ? d.rawScore : Math.round((d.marks * total) / 10) / 10);
}
interface SubmissionSummary {
  id: number;
  studentName: string;
  fileName: string;
  submittedAt: string;
  marks: number | null;
  lessonTitle: string;
  courseTitle: string;
  source: SubmissionSource;
}

type SourceFilter = "all" | SubmissionSource;

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

function StatusPill({ marks, rawScore, rawMax }: { marks: number | null; rawScore?: number | null; rawMax?: number | null }) {
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
      {rawScore != null && rawMax ? `${rawScore} / ${rawMax} points` : `${marks}%`} · Checked
    </span>
  );
}

function BackLink({ href = "/app/tutor/", label = "Back to tutor panel" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-800">
      <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
      {label}
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

/** Bumps when the AI assistant changes data (e.g. saves a grade), so lists refetch. */
function useDataVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(DATA_CHANGED_EVENT, bump);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, bump);
  }, []);
  return version;
}

/* ---------- inbox ---------- */
function SubmissionInbox() {
  const [submissions, setSubmissions] = useState<SubmissionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dataVersion = useDataVersion();
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
  }, [dataVersion]);

  // Seeded from the URL so "back" from the grader returns to the same tab.
  const initialFilter = parseFilter(useSearchParams().get("filter"));
  const [filter, setFilterState] = useState<SourceFilter>(initialFilter);
  const setFilter = (next: SourceFilter) => {
    setFilterState(next);
    window.history.replaceState(null, "", next === "all" ? "/app/tutor/assignment/" : `/app/tutor/assignment/?filter=${next}`);
  };
  const pending = submissions?.filter((s) => s.marks === null).length ?? 0;
  const checked = (submissions?.length ?? 0) - pending;
  const visible = submissions && filter !== "all" ? submissions.filter((s) => s.source === filter) : submissions;
  const filters: { key: SourceFilter; label: string; count: number; Icon: typeof Sparkles }[] = [
    { key: "all", label: "All", count: submissions?.length ?? 0, Icon: FileText },
    { key: "tutor", label: "Tutor assignments", count: submissions?.filter((s) => s.source === "tutor").length ?? 0, Icon: ClipboardList },
    { key: "ai", label: "AI practice", count: submissions?.filter((s) => s.source === "ai").length ?? 0, Icon: Sparkles },
  ];

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
          <div role="tablist" aria-label="Filter by assignment type" className="flex flex-wrap gap-2">
            {filters.map(({ key, label, count, Icon }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    active && key === "ai" && "border-violet-300 bg-violet-50 text-violet-700",
                    active && key !== "ai" && "border-primary/40 bg-primary/10 text-primary",
                    !active && "border-border bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                  <span className={cn("rounded-full px-1.5 text-xs tabular-nums", active ? "bg-white/70" : "bg-zinc-100")}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {visible && submissions && submissions.length > 0 && visible.length === 0 && (
          <Card className="p-6 text-center text-sm text-zinc-500">
            No {filter === "ai" ? "AI practice" : "tutor assignment"} submissions yet.
          </Card>
        )}

        {visible && visible.length > 0 && (
          <motion.div key={filter} className="space-y-2" variants={listVariants} initial="hidden" animate="show">
            {visible.map((submission) => (
              <motion.div key={submission.id} variants={itemVariants} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 28 }}>
                <Link href={submissionHref(submission.id, filter)} className="group block">
                  <Card className={`flex flex-col gap-3 border-l-4 p-4 transition-all hover:border-primary/40 hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${submission.marks === null ? "border-l-primary/60" : "border-l-emerald-500/60"}`}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={submission.studentName} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-zinc-900">
                          <span className="transition-colors group-hover:text-primary">{submission.studentName}</span>
                          <SubmissionSourceBadge source={submission.source} />
                        </p>
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

/* ---------- speed-grader navigation ---------- */
const parseFilter = (value: string | null): SourceFilter => (value === "tutor" || value === "ai" ? value : "all");
const FILTER_LABEL: Record<Exclude<SourceFilter, "all">, string> = { tutor: "tutor assignments", ai: "AI practice" };

function submissionHref(id: number, filter: SourceFilter) {
  return `/app/tutor/assignment/?submissionId=${id}${filter === "all" ? "" : `&filter=${filter}`}`;
}

/** Prev / dropdown / next across the same list (and filter) as the inbox, so a
 *  tutor can grade one submission after another without going back. */
function SubmissionNavigator({
  currentId, filter, currentMarks, onNavigate,
}: {
  currentId: number;
  filter: SourceFilter;
  /** The open submission's latest mark, so its entry updates right after saving. */
  currentMarks: number | null | undefined;
  onNavigate: (id: number) => void;
}) {
  const [list, setList] = useState<SubmissionSummary[] | null>(null);
  const dataVersion = useDataVersion();
  useEffect(() => {
    const aborter = new AbortController();
    fetch("/api/tutor/assignment-submissions", { signal: aborter.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as { submissions?: SubmissionSummary[] }).submissions ?? [] : []))
      .then((all) => setList(filter === "all" ? all : all.filter((s) => s.source === filter)))
      .catch(() => { if (!aborter.signal.aborted) setList([]); });
    return () => aborter.abort();
  }, [filter, dataVersion]);

  // Fold the open submission's latest mark into the list itself, so a grade
  // saved here still shows after moving on to the next submission.
  useEffect(() => {
    if (currentMarks === undefined) return;
    setList((prev) => prev?.map((s) => (s.id === currentId && s.marks !== currentMarks ? { ...s, marks: currentMarks } : s)) ?? prev);
  }, [currentId, currentMarks]);

  const items = list ?? [];
  const index = items.findIndex((s) => s.id === currentId);
  const prev = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const remaining = items.filter((s) => s.marks === null).length;

  return (
    <nav
      aria-label="Move between submissions"
      className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white/95 p-2 shadow-sm backdrop-blur"
    >
      <Button size="sm" variant="outline" onClick={() => prev && onNavigate(prev.id)} disabled={!prev} aria-label="Previous submission" title={prev ? `Previous: ${prev.studentName}` : "This is the first submission"}>
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <label className="sr-only" htmlFor="submission-picker">Jump to submission</label>
      <select
        id="submission-picker"
        value={index >= 0 ? currentId : ""}
        onChange={(e) => onNavigate(Number(e.target.value))}
        disabled={!list || items.length === 0}
        className="focus-ring h-9 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm text-zinc-800"
      >
        {!list && <option value="">Loading submissions…</option>}
        {list && index < 0 && <option value="">This submission isn't in the current list</option>}
        {items.map((s, i) => (
          <option key={s.id} value={s.id}>
            {i + 1}. {s.studentName} — {s.lessonTitle} · {s.source === "ai" ? "AI practice" : "Tutor"} · {s.marks === null ? "Needs checking" : `✓ ${s.marks}%`}
          </option>
        ))}
      </select>

      <Button size="sm" variant="outline" onClick={() => next && onNavigate(next.id)} disabled={!next} aria-label="Next submission" title={next ? `Next: ${next.studentName}` : "This is the last submission"}>
        <ChevronRight className="h-4 w-4" />
      </Button>

      {list && items.length > 0 && (
        <span className="px-1 text-xs tabular-nums text-zinc-500">
          {index >= 0 ? `${index + 1} of ${items.length}` : `${items.length} total`}
          {" · "}
          {remaining === 0 ? "all checked" : `${remaining} to check`}
          {filter !== "all" && ` · ${FILTER_LABEL[filter]} only`}
        </span>
      )}
    </nav>
  );
}

/* ---------- grade view ---------- */
function GradeView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const submissionIdParam = searchParams.get("submissionId");
  const filter = parseFilter(searchParams.get("filter"));
  const submissionId = Number(submissionIdParam);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marksInput, setMarksInput] = useState("");
  const [remark, setRemark] = useState("");
  const [scoreInputs, setScoreInputs] = useState<Record<number, string>>({});
  const [savingGrade, setSavingGrade] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // Grading wants the room: tuck the sidebar away while a submission is open,
  // and put it back the way the tutor had it when they leave.
  const { state, setSidebarCollapsed } = useStore();
  const sidebarWasCollapsed = useRef(state.sidebarCollapsed);
  const grading = Boolean(submissionIdParam);
  useEffect(() => {
    if (!grading) return;
    const before = sidebarWasCollapsed.current;
    setSidebarCollapsed(true);
    return () => setSidebarCollapsed(before);
  }, [grading, setSidebarCollapsed]);
  useEffect(() => {
    if (!submissionIdParam) return;
    // Switching submissions (speed-grader): never show the previous one's data.
    setDetail(null);
    setError(null);
    setSavedFlash(false);
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
          setMarksInput(data.rubric.length === 0 ? savedPoints(data) : "");
          setRemark(savedStatus(data));
          setScoreInputs(Object.fromEntries(data.rubric.map((c) => [c.id, c.score !== null ? String(c.score) : ""])));
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this submission."); });
    return () => { cancelled = true; };
  }, [submissionId, submissionIdParam]);
  // Autosave: a short pause after the last change saves the grade, as long as
  // it is complete and valid. The Save button still saves straight away.
  const autosaveAttempt = useRef("");
  useEffect(() => {
    if (!detail || savingGrade || !hasUnsavedGrade()) return;
    // One automatic try per set of values, so a failed save isn't retried in a loop.
    const signature = JSON.stringify([detail.submission.id, marksInput, remark, scoreInputs]);
    if (autosaveAttempt.current === signature) return;
    const inRange = (value: string, max: number) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max;
    const ready = detail.rubric.length === 0
      ? inRange(marksInput, pointsTotal(detail))
      : detail.rubric.every((c) => inRange(scoreInputs[c.id] ?? "", c.maxPoints));
    if (!ready) return;
    const timer = setTimeout(() => {
      autosaveAttempt.current = signature;
      void (detail.rubric.length === 0 ? saveFlatMarks() : saveRubricScores());
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // The save functions read the same state listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, marksInput, remark, scoreInputs, savingGrade]);
  if (!submissionIdParam) return <SubmissionInbox />;

  async function saveFlatMarks() {
    if (!detail) return;
    const points = Number(marksInput);
    const total = pointsTotal(detail);
    if (marksInput.trim() === "" || !Number.isFinite(points) || points < 0 || points > total) {
      setError(`Points must be a number between 0 and ${total}.`);
      return;
    }
    setSavingGrade(true);
    setError(null);
    try {
      const res = await fetch("/api/tutor/assignment-submissions/grade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: detail.submission.id, points, status: remark }),
      });
      const data = (await res.json().catch(() => ({}))) as { marks?: number; gradedAt?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save the points.");
      const pct = data.marks ?? Math.round((points / total) * 1000) / 10;
      // Keep the loaded copy in sync so the unsaved-changes check is accurate.
      setDetail((prev) => prev && { ...applyGradeResult(prev, pct, points, total, data.gradedAt ?? new Date().toISOString()), remark });
      setMarksInput(String(points));
      flashSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the points.");
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
        body: JSON.stringify({ submissionId: detail.submission.id, scores, status: remark }),
      });
      const data = (await res.json().catch(() => ({}))) as { marks?: number; rawScore?: number; rawMax?: number; gradedAt?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Couldn't save the grade.");
      // Keep the loaded copy in sync so the unsaved-changes check is accurate.
      setDetail((prev) => prev && {
        ...applyGradeResult(prev, data.marks ?? 0, data.rawScore ?? null, data.rawMax ?? null, data.gradedAt ?? new Date().toISOString()),
        remark,
        rubric: prev.rubric.map((c) => ({ ...c, score: Number(scoreInputs[c.id]) })),
      });
      setScoreInputs((inputs) => Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, String(Number(v))])));
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

  /** Points/status changed but not saved yet for the open submission. */
  function hasUnsavedGrade(): boolean {
    if (!detail) return false;
    if (remark !== savedStatus(detail)) return true;
    if (detail.rubric.length === 0) {
      return marksInput !== savedPoints(detail);
    }
    return detail.rubric.some((c) => (scoreInputs[c.id] ?? "") !== (c.score !== null ? String(c.score) : ""));
  }

  function goToSubmission(id: number) {
    if (!Number.isSafeInteger(id) || id === submissionId) return;
    if (hasUnsavedGrade() && !window.confirm(`You haven't saved the grade for ${detail?.submission.studentName}. Leave without saving?`)) return;
    router.push(submissionHref(id, filter));
  }

  const navigator = (
    <SubmissionNavigator
      currentId={submissionId}
      filter={filter}
      currentMarks={detail?.submission.id === submissionId ? detail.marks : undefined}
      onNavigate={goToSubmission}
    />
  );

  if (error && !detail) {
    return (
      <PageTransition>
        <div data-wide-page className="mx-auto max-w-3xl space-y-4">
          {navigator}
          <Card className="p-6"><ErrorNote message={error} /></Card>
        </div>
      </PageTransition>
    );
  }
  if (!detail) {
    return (
      <PageTransition>
        <div data-wide-page className="mx-auto max-w-3xl space-y-4">
          {navigator}
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
  const total = pointsTotal(detail);
  const typedPoints = Number(marksInput);
  const typedPct = marksInput.trim() !== "" && Number.isFinite(typedPoints) && typedPoints >= 0 && typedPoints <= total
    ? Math.round((typedPoints / total) * 1000) / 10 : null;
  const submitted = new Date(submission.submittedAt);
  const late = submission.dueDate ? submitted > new Date(`${submission.dueDate}T23:59:59`) : false;
  const shortDate = (d: Date) => d.toLocaleDateString([], { month: "short", day: "numeric" });
  const filledCount = hasRubric ? rubric.filter((c) => (scoreInputs[c.id] ?? "").trim() !== "").length : 0;

  return (
    <PageTransition>
      {/* Wide screens: the submitted document on the left, everything for
          grading (switching students, the brief, points, status) in a panel
          on the right that stays in view. Narrow screens stack as before. */}
      <div data-wide-page className="gap-4 space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="space-y-4 lg:sticky lg:top-20 lg:col-start-2 lg:row-start-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-2 lg:pl-1 lg:pr-1">
        {navigator}

        {/* header: who, what, when — the file itself is on the left, and the total is beside the points box */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-2">
          <BackLink
            href={filter === "all" ? "/app/tutor/assignment/" : `/app/tutor/assignment/?filter=${filter}`}
            label="Back to all submissions"
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-zinc-900">
                {submission.studentName}
                <SubmissionSourceBadge source={submission.source} className="text-xs" />
              </h1>
              <p className="truncate text-sm text-zinc-500">{submission.lessonTitle} · {submission.courseTitle}</p>
            </div>
            <span className="shrink-0"><StatusPill marks={detail.marks} rawScore={detail.rawScore} rawMax={detail.rawMax} /></span>
          </div>
          <p className="text-xs text-zinc-500" title={`${submission.fileName} · submitted ${submitted.toLocaleString()}`}>
            Submitted {shortDate(submitted)}
            {submission.dueDate && <> · Due {shortDate(new Date(`${submission.dueDate}T00:00:00`))}</>}
            {late && <span className="font-medium text-amber-700"> · Late</span>}
          </p>
        </motion.div>

        {/* What the learner was asked to do. AI practice briefs are violet and
            personalized per learner; tutor assignments show the lesson's own text. */}
        {submission.source === "ai" && submission.assignmentBrief && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.04 }}>
            <Card className="border-violet-200 bg-violet-50/40 p-4">
              <details open className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-zinc-900">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    AI-generated practice brief
                    <span className="font-normal text-zinc-500">· for {submission.studentName}</span>
                  </span>
                  <span className="text-xs font-normal text-zinc-500 group-open:hidden">Show</span>
                  <span className="hidden text-xs font-normal text-zinc-500 group-open:inline">Hide</span>
                </summary>
                <p className="mt-1 text-xs text-violet-800/80">
                  You didn&apos;t write this — AI generated it for this learner from the lesson. Grade against its deliverables and success criteria.
                </p>
                <div className="mt-3">
                  {(() => {
                    const brief = parseAssignment(submission.assignmentBrief);
                    return brief ? (
                      <AssignmentBrief assignment={brief} learnerName={submission.studentName} />
                    ) : (
                      <p className="rounded-xl border border-primary/15 bg-white p-4 text-sm leading-relaxed text-zinc-800">
                        {submission.assignmentBrief}
                      </p>
                    );
                  })()}
                </div>
              </details>
            </Card>
          </motion.div>
        )}

        {submission.source === "tutor" && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.04 }}>
            <Card className="border-primary/20 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                <ClipboardList className="h-4 w-4 text-primary" />
                Your assignment for this lesson
              </p>
              {submission.tutorAssignment ? (
                <p className="mt-2 whitespace-pre-line rounded-xl border border-primary/15 bg-primary/[0.03] p-3 text-sm leading-relaxed text-zinc-800">
                  {submission.tutorAssignment}
                </p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  This lesson requires a file submission but has no written assignment text — add one in the lesson editor.
                </p>
              )}
            </Card>
          </motion.div>
        )}

        {/* grading card */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.08 }}>
          <Card className="space-y-3 p-4">
            <label className="block text-sm font-medium text-zinc-800">
              Add status
              <select value={remark} onChange={(event) => setRemark(event.target.value)} className="focus-ring mt-1 h-10 w-full rounded-xl border border-border bg-white px-3 text-sm sm:max-w-xs">
                <option value="">None</option>
                <option>Excused</option><option>Missing</option><option>Late</option>
              </select>
            </label>
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
                  Points
                  <Input
                    type="number" min={0} max={total} value={marksInput}
                    onChange={(e) => setMarksInput(e.target.value)}
                    className="h-9 w-20 text-right tabular-nums transition-shadow focus-visible:ring-primary/40"
                  />
                  <span className="font-normal tabular-nums text-zinc-600">/ {total}{typedPct !== null && <span className="text-zinc-400"> ({typedPct}%)</span>}</span>
                </label>
                <SaveButton saving={savingGrade} saved={savedFlash} label="Save points" onClick={() => void saveFlatMarks()} disabled={savingGrade || !marksInput.trim()} />
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
            <p className="text-xs text-zinc-500">
              {savingGrade ? "Saving…" : hasUnsavedGrade() ? "Unsaved changes — saves automatically when you pause, or use the button." : "Changes save automatically."}
            </p>
            <p className="border-t pt-2 text-xs text-zinc-500">
              This lesson: {stats.checked} of {stats.total} checked{stats.averageMarks !== null && <> · average {stats.averageMarks}%</>}
            </p>
          </Card>
        </motion.div>
      </div>

        <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ delay: 0.16 }} className="min-w-0 lg:col-start-1 lg:row-start-1">
          {/* Keyed so each submission gets a fresh viewer: its own undo history,
              tool and page — undo must never touch another student's markup. */}
          <DocumentMarkupViewer key={submission.id} submissionId={submission.id} mimeType={submission.mimeType} />
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