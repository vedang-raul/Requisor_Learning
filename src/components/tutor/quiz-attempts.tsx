"use client";

/**
 * Quiz attempts in Check assignments: every submitted attempt on the tutor's
 * quizzes, "Needs checking" for those with essay answers waiting, and a review
 * of one attempt (each question, the learner's answer, the points earned and
 * the answer key) where the tutor gives essay points and a comment.
 */
import { Fragment, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ClipboardCheck, Hourglass, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { LessonMarkdown } from "@/components/ui/lesson-markdown";
import { cn } from "@/lib/utils";
import { QUESTION_TYPE_LABELS, type Answer, type Question, type QuestionResult } from "@/lib/quiz/quiz";
import type { TutorAttemptRow } from "@/lib/quiz/quiz-store";

type DetailQuestion = Question & { answer: Answer | null; earned: number; status: QuestionResult["status"]; correctAnswer: string; manual: number | null };
type Detail = {
  id: number; studentName: string; lessonTitle: string; attempt: number; submittedAt: string; score: number | null; maxScore: number;
  pending: boolean; tutorComment: string | null; dueDate: string | null; questions: DetailQuestion[];
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const ICON = { correct: CheckCircle2, partial: MinusCircle, incorrect: XCircle, pending: Hourglass, unanswered: MinusCircle, info: CheckCircle2 };
const TONE = { correct: "text-emerald-700", partial: "text-amber-700", incorrect: "text-red-700", pending: "text-zinc-600", unanswered: "text-zinc-500", info: "text-zinc-500" };

function answerText(q: DetailQuestion): string {
  const a = q.answer;
  if (a === null || a === "" || (Array.isArray(a) && !a.length)) return "No answer";
  if (q.choices) return (Array.isArray(a) ? a : [a as string]).map((id) => q.choices!.find((c) => c.id === id)?.text ?? id).join("; ");
  if (typeof a === "object" && !Array.isArray(a)) {
    if (q.type === "matching") return (q.pairs ?? []).map((p) => `${p.left} → ${a[p.id] || "—"}`).join("; ");
    if (q.type === "multiple_dropdowns") return Object.entries(a).map(([k, v]) => `[${k}] ${q.dropdowns?.find((d) => d.name === k)?.choices.find((c) => c.id === v)?.text ?? "—"}`).join("; ");
    return Object.entries(a).map(([k, v]) => `[${k}] ${v || "—"}`).join("; ");
  }
  return String(a);
}

function Review({ id, onSaved }: { id: number; onSaved: (row: Pick<TutorAttemptRow, "id" | "score" | "pending">) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    fetch(`/api/tutor/quiz-attempts?attemptId=${id}`, { cache: "no-store" })
      .then(async (r) => { const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error ?? "Couldn't load the attempt."); return data.attempt as Detail; })
      .then((a) => { setD(a); setComment(a.tutorComment ?? ""); setPoints(Object.fromEntries(a.questions.filter((q) => q.type === "essay").map((q) => [q.id, q.manual === null ? "" : String(q.manual)]))); })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load the attempt."));
  }, [id]);

  async function save() {
    setSaving(true); setError(null); setSaved(false);
    try {
      const r = await fetch("/api/tutor/quiz-attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: id, manual: points, comment }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? "Couldn't save.");
      setD(data.attempt); setSaved(true);
      onSaved({ id, score: data.attempt.score, pending: data.attempt.pending });
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save."); }
    finally { setSaving(false); }
  }

  if (error && !d) return <p role="alert" className="px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!d) return <p className="flex items-center gap-2 px-4 py-3 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>;
  const essays = d.questions.filter((q) => q.type === "essay");
  let n = 0;
  return (
    <div className="space-y-3 bg-zinc-50/70 px-4 py-4">
      <p className="text-sm text-zinc-700">Score <b className="text-zinc-900">{d.score === null ? "—" : fmt(d.score)} / {fmt(d.maxScore)}</b>{d.pending && <span className="ml-2 text-xs text-amber-700">Essay points needed</span>}</p>
      <ol className="space-y-2.5">
        {d.questions.map((q) => {
          if (q.type === "text_only") return null;
          n += 1;
          const Icon = ICON[q.status];
          return (
            <li key={q.id} className="rounded-xl border border-zinc-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                <span className="text-zinc-500">Question {n} · {QUESTION_TYPE_LABELS[q.type]}</span>
                <span className={cn("flex items-center gap-1", TONE[q.status])}><Icon className="h-3.5 w-3.5" />{fmt(q.earned)} / {fmt(q.points)}</span>
              </div>
              <div className="mt-1.5 text-sm">{q.type === "fill_in_multiple_blanks" || q.type === "multiple_dropdowns" ? <p className="whitespace-pre-line text-zinc-800">{q.text}</p> : <LessonMarkdown content={q.text} />}</div>
              <p className="mt-1.5 text-sm"><span className="text-zinc-500">Answer:</span> <span className="whitespace-pre-line text-zinc-800">{answerText(q)}</span></p>
              {q.correctAnswer && <p className="text-sm"><span className="text-zinc-500">Key:</span> <span className="text-emerald-800">{q.correctAnswer}</span></p>}
              {q.type === "essay" && (
                <label className="mt-2 flex items-center gap-2 text-sm font-medium text-zinc-700">
                  Points
                  <Input type="number" min="0" max={q.points} step="0.5" className="h-9 w-24" value={points[q.id] ?? ""} onChange={(e) => setPoints({ ...points, [q.id]: e.target.value })} aria-label={`Points for question ${n}`} />
                  <span className="text-zinc-500">of {fmt(q.points)}</span>
                </label>
              )}
            </li>
          );
        })}
      </ol>
      <label className="block text-sm font-medium text-zinc-700">Comment for the learner (optional)
        <Textarea className="mt-1" rows={2} maxLength={5000} value={comment} onChange={(e) => setComment(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{essays.length ? "Save points" : "Save comment"}</Button>
        {saved && <span className="text-xs text-emerald-700">Saved</span>}
      </div>
    </div>
  );
}

export function QuizAttemptsCard() {
  const [rows, setRows] = useState<TutorAttemptRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"todo" | "all">("todo");
  const [lesson, setLesson] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/tutor/quiz-attempts", { cache: "no-store" })
      .then(async (r) => { const data = await r.json().catch(() => ({})); if (!r.ok) throw new Error(data.error ?? "Couldn't load quiz attempts."); return data.attempts as TutorAttemptRow[]; })
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load quiz attempts."));
  }, []);
  if (error) return <Card className="p-5"><p role="alert" className="text-sm text-red-700">{error}</p></Card>;
  if (!rows || rows.length === 0) return null;
  const lessons = [...new Map(rows.map((r) => [r.lessonId, r.lessonTitle])).entries()];
  const inLesson = lesson ? rows.filter((r) => r.lessonId === lesson) : rows;
  const shown = tab === "todo" ? inLesson.filter((r) => r.pending) : inLesson;
  const late = (r: TutorAttemptRow) => Boolean(r.dueDate && r.submittedAt.slice(0, 10) > r.dueDate);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-3">
        <p className="flex items-center gap-2 px-1 text-base font-semibold text-zinc-900"><ClipboardCheck className="h-4 w-4 text-primary" />Quiz attempts</p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Show" className="flex gap-1 rounded-xl bg-zinc-100 p-1">
            {([["todo", "Needs checking", inLesson.filter((r) => r.pending).length], ["all", "All", inLesson.length]] as const).map(([key, label, count]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={cn("focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition", tab === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}>{label} · {count}</button>
            ))}
          </div>
          {lessons.length > 1 && (
            <select value={lesson} onChange={(e) => setLesson(e.target.value)} aria-label="Quiz" className="focus-ring h-9 max-w-[14rem] rounded-lg border border-border bg-white px-2 text-sm text-zinc-800">
              <option value="">All quizzes</option>
              {lessons.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
            </select>
          )}
        </div>
      </div>
      {shown.length === 0 ? <p className="px-4 py-8 text-center text-sm text-zinc-500">{tab === "todo" ? "Nothing to check: quizzes mark themselves unless they have essay questions." : "Nothing here."}</p> : (
        <ul className="divide-y divide-zinc-100">
          {shown.map((r) => (
            <Fragment key={r.id}>
              <li>
                <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}
                  className="focus-ring grid w-full gap-2 px-4 py-3 text-left transition hover:bg-zinc-50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] md:items-center">
                  <span className="min-w-0"><span className="block truncate font-semibold text-zinc-900">{r.studentName}</span><span className="block truncate text-sm text-zinc-500">{r.lessonTitle} · {r.courseTitle}</span></span>
                  <span className="text-sm text-zinc-600">Attempt {r.attempt} · {new Date(r.submittedAt).toLocaleDateString([], { day: "numeric", month: "short" })}</span>
                  <span className="flex gap-1.5">{late(r) && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Late</span>}<span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">Quiz</span></span>
                  <span className="flex items-center justify-end gap-1 text-sm font-semibold">
                    {r.pending ? <span className="text-primary">Check</span> : <span className="text-emerald-700">{r.score === null ? "—" : fmt(r.score)} / {fmt(r.maxScore)}</span>}
                    <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition", open === r.id && "rotate-180")} />
                  </span>
                </button>
              </li>
              {open === r.id && <li><Review id={r.id} onSaved={(u) => setRows((all) => all?.map((x) => (x.id === u.id ? { ...x, score: u.score, pending: u.pending } : x)) ?? null)} /></li>}
            </Fragment>
          ))}
        </ul>
      )}
    </Card>
  );
}
