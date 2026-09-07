"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, Loader2, Save } from "lucide-react";
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

  return (
    <PageTransition>
      <div className="space-y-4">
        <div>
          <Link href="/app/tutor/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to tutor panel
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">Assignment submissions</h1>
          <p className="mt-1 text-sm text-zinc-500">Open a learner submission to review, annotate, and grade it.</p>
        </div>
        {error && <Card className="p-5"><p role="alert" className="text-sm text-red-700">{error}</p></Card>}
        {!error && submissions === null && (
          <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading submissions…</div>
        )}
        {submissions?.length === 0 && (
          <Card className="p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 font-medium text-zinc-900">No submissions yet</p>
            <p className="mt-1 text-sm text-zinc-500">Learner uploads will appear here.</p>
          </Card>
        )}
        {submissions && submissions.length > 0 && (
          <div className="space-y-2">
            {submissions.map((submission) => (
              <Link key={submission.id} href={`/app/tutor/assignment/?submissionId=${submission.id}`} className="block">
                <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">{submission.studentName}</p>
                    <p className="truncate text-sm text-zinc-600">{submission.lessonTitle} · {submission.courseTitle}</p>
                    <p className="mt-1 text-xs text-zinc-500">{submission.fileName} · {new Date(submission.submittedAt).toLocaleString()}</p>
                  </div>
                  <span className={submission.marks === null ? "text-sm font-medium text-primary" : "text-sm font-medium text-emerald-700"}>
                    {submission.marks === null ? "Check submission" : `${submission.marks}% · Checked`}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

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
        <Card className="p-6"><p role="alert" className="text-sm text-red-700">{error}</p></Card>
      </PageTransition>
    );
  }
  if (!detail) {
    return (
      <PageTransition>
        <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading submission…</div>
      </PageTransition>
    );
  }

  const { submission, stats, rubric } = detail;
  const hasRubric = rubric.length > 0;
  const runningTotal = hasRubric
    ? rubric.reduce((sum, c) => sum + (Number(scoreInputs[c.id]) || 0), 0)
    : null;
  const runningMax = hasRubric ? rubric.reduce((sum, c) => sum + c.maxPoints, 0) : null;

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/app/tutor/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to tutor panel
            </Link>
            <h1 className="mt-2 text-lg font-semibold text-zinc-900">{submission.studentName}</h1>
            <p className="text-sm text-zinc-500">
              {submission.fileName} · {submission.lessonTitle} · {submission.courseTitle}
            </p>
          </div>

          <Card className="flex items-center gap-4 px-4 py-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Checked</p>
              <p className="text-sm font-semibold text-zinc-900">{stats.checked} / {stats.total}</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Avg. marks</p>
              <p className="text-sm font-semibold text-zinc-900">{stats.averageMarks !== null ? `${stats.averageMarks}%` : "—"}</p>
            </div>
          </Card>
        </div>

        <Card className="space-y-3 p-4">
          {hasRubric ? (
            <>
              <ul className="space-y-2">
                {rubric.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{c.title}</p>
                      {c.description && <p className="mt-0.5 text-xs text-zinc-500">{c.description}</p>}
                    </div>
                    <label className="flex shrink-0 items-center gap-1 text-sm text-zinc-600">
                      <Input
                        type="number" min={0} max={c.maxPoints}
                        value={scoreInputs[c.id] ?? ""}
                        onChange={(e) => setScoreInputs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className="h-9 w-16 text-right"
                        aria-label={`Score for ${c.title}`}
                      />
                      / {c.maxPoints}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                <p className="text-sm text-zinc-700">
                  Total: <span className="font-semibold">{runningTotal} / {runningMax}</span>
                  {runningMax ? <span className="text-zinc-500"> ({Math.round(((runningTotal ?? 0) / runningMax) * 1000) / 10}%)</span> : null}
                </p>
                <Button size="sm" onClick={() => void saveRubricScores()} disabled={savingGrade}>
                  {savingGrade ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFlash ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                  {savedFlash ? "Saved" : "Save grade"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                Marks (0–100)
                <Input
                  type="number" min={0} max={100} value={marksInput}
                  onChange={(e) => setMarksInput(e.target.value)}
                  className="h-9 w-24"
                />
              </label>
              <Button size="sm" onClick={() => void saveFlatMarks()} disabled={savingGrade || !marksInput.trim()}>
                {savingGrade ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedFlash ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                {savedFlash ? "Saved" : "Save marks"}
              </Button>
              <span className="text-xs text-zinc-500">No rubric set up for this lesson — set one from the lesson editor to grade by criteria instead.</span>
            </div>
          )}
          {detail.gradedAt && <span className="text-xs text-zinc-500">Last graded {new Date(detail.gradedAt).toLocaleString()}</span>}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </Card>

        <DocumentMarkupViewer submissionId={submission.id} mimeType={submission.mimeType} />
      </div>
    </PageTransition>
  );
}

export default function GradeSubmissionPage() {
  return (
    <Suspense>
      <GradeView />
    </Suspense>
  );
}
