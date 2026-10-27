"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, CircleDashed, FileCheck2, FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/ui/motion";
import { dueDateLabel, dueInLabel } from "@/lib/courses/assignment-dates";
import { cn } from "@/lib/utils";

interface Submission {
  id: number;
  lessonId: string;
  lessonTitle: string;
  lessonExists: boolean;
  courseSlug: string;
  courseTitle: string;
  fileName: string;
  fileSize: number;
  submittedAt: string;
  checked: boolean;
  marks: number | null;
  rawScore: number | null;
  rawMax: number | null;
  gradedAt: string | null;
  remark: string | null;
  dueDate: string | null;
  totalMarks: number | null;
}

/** A graded assignment still to hand in: its lesson has been started or completed, with no file yet. */
interface Due {
  lessonId: string;
  lessonTitle: string;
  courseSlug: string;
  courseTitle: string;
  dueDate: string | null;
  totalMarks: number | null;
  lessonCompleted: boolean;
}

type Filter = "all" | "waiting" | "graded" | "attention";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const lessonHref = (courseSlug: string, lessonId: string) => `/app/learn/?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`;
const tag = (s: Submission) => (s.remark && ["Late", "Missing", "Excused"].includes(s.remark) ? s.remark : null);
/** The grade as points: exact when saved as points, otherwise worked out from the percentage. */
function score(s: Submission): { got: number; of: number } | null {
  if (s.marks === null) return null;
  if (s.rawScore !== null && s.rawMax) return { got: s.rawScore, of: s.rawMax };
  const of = s.totalMarks ?? 100;
  return { got: Math.round((s.marks * of) / 10) / 10, of };
}

export default function SubmissionsPage() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; submissions: Submission[]; due: Due[] } | { status: "error"; message: string }
  >({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [course, setCourse] = useState("all");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/assignment/submissions")
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { submissions?: Submission[]; due?: Due[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Couldn't load your submissions.");
        if (!cancelled) setState({ status: "ready", submissions: data.submissions ?? [], due: data.due ?? [] });
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't load your submissions." });
      });
    return () => { cancelled = true; };
  }, []);

  const submissions = useMemo(() => (state.status === "ready" ? state.submissions : []), [state]);

  // Still to hand in, from the server: graded lessons the learner has started or completed, with no file yet.
  const dueNext = state.status === "ready" ? state.due : [];

  const courses = useMemo(() => [...new Map(submissions.map((s) => [s.courseSlug, s.courseTitle])).entries()], [submissions]);
  const inCourse = course === "all" ? submissions : submissions.filter((s) => s.courseSlug === course);
  const counts = {
    all: inCourse.length,
    waiting: inCourse.filter((s) => !s.checked).length,
    graded: inCourse.filter((s) => s.checked).length,
    attention: inCourse.filter((s) => tag(s) === "Late" || tag(s) === "Missing").length,
  };
  const shown = inCourse.filter((s) =>
    filter === "waiting" ? !s.checked : filter === "graded" ? s.checked : filter === "attention" ? tag(s) === "Late" || tag(s) === "Missing" : true);
  const tabs: [Filter, string][] = [["all", "All"], ["waiting", "Not checked yet"], ["graded", "Graded"], ["attention", "Needs attention"]];

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Submissions</h1>
          <p className="text-sm text-zinc-500">What&apos;s still due, and everything you&apos;ve handed in.</p>
        </div>

        {dueNext.length > 0 && (
          <section aria-labelledby="due-next">
            <h2 id="due-next" className="text-base font-semibold text-zinc-900">Still to hand in · {dueNext.length}</h2>
            <p className="mb-2 text-xs text-zinc-500">Graded assignments from lessons you&apos;ve started. Each one appears here as you reach its lesson.</p>
            <div className="grid gap-3 md:grid-cols-2">
              {dueNext.map((d, i) => {
                const dueIn = d.dueDate ? dueInLabel(d.dueDate) : null;
                return (
                  <Card key={d.lessonId} className={cn("flex flex-col gap-3 p-4", dueIn?.soon && "border-amber-300")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-zinc-900">{d.lessonTitle}</p>
                        <p className="truncate text-xs text-zinc-500">{d.courseTitle}{d.totalMarks ? ` · ${d.totalMarks} points` : ""}</p>
                      </div>
                      {dueIn && <Tag tone={dueIn.overdue ? "danger" : dueIn.soon ? "warning" : "default"} className="shrink-0">{dueIn.overdue ? dueIn.text : dueIn.text.replace(/^Due /, "")}</Tag>}
                    </div>
                    <p className={cn("flex items-center gap-1.5 text-xs font-medium", d.lessonCompleted ? "text-emerald-700" : "text-zinc-500")}>
                      {d.lessonCompleted
                        ? <><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Lesson completed · hand in your file</>
                        : <><CircleDashed className="h-3.5 w-3.5" aria-hidden="true" />Lesson in progress</>}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-800">
                        <CalendarDays className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                        {d.dueDate ? dueDateLabel(d.dueDate) : "No due date"}
                      </p>
                      <Link href={lessonHref(d.courseSlug, d.lessonId)}>
                        <Button size="sm" variant={i === 0 ? "primary" : "outline"}>{i === 0 || d.lessonCompleted ? "Hand it in" : "Open lesson"}</Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {state.status === "loading" && (
          <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
        )}
        {state.status === "error" && (
          <Card className="p-6"><p role="alert" className="text-sm text-red-700">{state.message}</p></Card>
        )}
        {state.status === "ready" && submissions.length === 0 && (
          <Card className="flex flex-col items-center gap-2 p-10 text-center">
            <FileCheck2 className="h-6 w-6 text-zinc-300" />
            <p className="text-sm text-zinc-500">
              {dueNext.length ? "Nothing handed in yet. Your work appears here once you hand it in." : "No assignments yet. When a lesson you start has a graded assignment, it appears here."}
            </p>
          </Card>
        )}

        {state.status === "ready" && submissions.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <h2 className="text-base font-semibold text-zinc-900">Handed in</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1 rounded-xl bg-zinc-100 p-1">
                  {tabs.map(([key, label]) => (
                    <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
                      className={cn("focus-ring rounded-lg px-2.5 py-1.5 text-xs font-medium transition", filter === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}>
                      {label} · {counts[key]}
                    </button>
                  ))}
                </div>
                {courses.length > 1 && (
                  <select aria-label="Course" value={course} onChange={(e) => setCourse(e.target.value)} className="focus-ring h-9 rounded-lg border border-border bg-white px-2 text-sm">
                    <option value="all">All courses</option>
                    {courses.map(([slug, title]) => <option key={slug} value={slug}>{title}</option>)}
                  </select>
                )}
              </div>
            </div>

            {shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">Nothing here.</p>}
            <ul className="divide-y divide-zinc-100">
              {shown.map((s) => {
                const t = tag(s);
                const pts = score(s);
                return (
                  <li key={s.id} className={cn("grid grid-cols-2 gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1.6fr)_6.5rem_6.5rem_minmax(0,1fr)_auto] md:items-center", t === "Missing" && "bg-red-50/50")}>
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <p className="truncate font-semibold text-zinc-900">{s.lessonTitle}</p>
                      <p className="truncate text-xs text-zinc-500">{s.courseTitle}</p>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-500"><FileText className="h-3 w-3 shrink-0" aria-hidden="true" />{s.fileName} · {formatBytes(s.fileSize)}</p>
                    </div>
                    <div className="text-xs"><p className="text-zinc-500">Submitted</p><p className="font-medium text-zinc-800">{shortDate(s.submittedAt)}</p></div>
                    <div className="text-xs"><p className="text-zinc-500">Due</p><p className="font-medium text-zinc-800">{s.dueDate ? dueDateLabel(s.dueDate).replace(/^\w+,?\s/, "") : "—"}</p></div>
                    <div className="col-span-2 space-y-1 md:col-span-1">
                      {t === "Excused" ? (
                        <><Tag>Excused</Tag><p className="text-xs text-zinc-500">Doesn&apos;t count</p></>
                      ) : pts ? (
                        <>
                          <p className="text-zinc-900"><span className="text-lg font-semibold tabular-nums">{pts.got}</span><span className="text-sm text-zinc-500"> / {pts.of}</span></p>
                          <p className="text-xs font-medium text-emerald-700">Graded {s.gradedAt ? new Date(s.gradedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}</p>
                          {t && <Tag tone={t === "Missing" ? "danger" : "warning"}>{t}</Tag>}
                        </>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-1"><Tag tone="primary">Not checked yet</Tag>{t && <Tag tone={t === "Missing" ? "danger" : "warning"}>{t}</Tag>}</div>
                          {s.totalMarks && <p className="text-xs text-zinc-500">Out of {s.totalMarks} points</p>}
                        </>
                      )}
                    </div>
                    <div className="col-span-2 flex shrink-0 flex-wrap gap-2 md:col-span-1 md:justify-end">
                      {s.lessonExists && (
                        <Link href={lessonHref(s.courseSlug, s.lessonId)}><Button size="sm" variant="outline">Open lesson</Button></Link>
                      )}
                      <Button size="sm" variant="outline" onClick={() => window.open(`/api/assignment/submission/file?submissionId=${s.id}`, "_blank")} aria-label={`View your file for ${s.lessonTitle}`}>
                        View file
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
