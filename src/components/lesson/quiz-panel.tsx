"use client";

/**
 * A lesson's graded quiz, for the learner: the quiz's terms and their score,
 * taking an attempt (every Canvas question type, one at a time or all
 * together, timed or not; answers save as they go and a timed quiz hands
 * itself in when time runs out), and their results as the quiz allows.
 * Everything is scored on the server (/api/quiz/*).
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Clock, ClipboardCheck, Hourglass, Loader2, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { LessonMarkdown } from "@/components/ui/lesson-markdown";
import { cn } from "@/lib/utils";
import type { LearnerQuiz } from "@/lib/quiz/learner-view";
import type { Answer, Answers, PublicQuestion, ResultQuestion } from "@/lib/quiz/quiz";
import { askConfirm } from "@/components/ui/confirm-dialog";

const BLANK = /\[([A-Za-z0-9_ -]{1,40})\]/g;
const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
const date = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Something went wrong. Try again.");
  return data;
}

/** Text with [blank] markers replaced by controls. */
function Inline({ text, render }: { text: string; render: (name: string) => React.ReactNode }) {
  const parts = text.split(BLANK);
  return <p className="text-sm leading-loose text-zinc-800">{parts.map((p, i) => (i % 2 === 1 ? <Fragment key={i}>{render(p.trim())}</Fragment> : <span key={i} className="whitespace-pre-line">{p}</span>))}</p>;
}

function QuestionInput({ q, value, onChange, disabled }: { q: PublicQuestion; value: Answer | undefined; onChange: (a: Answer) => void; disabled?: boolean }) {
  const map = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
  switch (q.type) {
    case "multiple_choice": case "true_false":
      return (
        <div role="radiogroup" className="space-y-1.5">
          {q.choices!.map((c) => (
            <label key={c.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition", value === c.id ? "border-primary bg-primary/[0.05]" : "border-zinc-200 hover:border-zinc-300")}>
              <input type="radio" className="mt-0.5 accent-[#0f766e]" name={q.id} checked={value === c.id} onChange={() => onChange(c.id)} disabled={disabled} />{c.text}
            </label>
          ))}
        </div>
      );
    case "multiple_answers": {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5">
          {q.choices!.map((c) => (
            <label key={c.id} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition", picked.includes(c.id) ? "border-primary bg-primary/[0.05]" : "border-zinc-200 hover:border-zinc-300")}>
              <input type="checkbox" className="mt-0.5 accent-[#0f766e]" checked={picked.includes(c.id)} disabled={disabled}
                onChange={() => onChange(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />{c.text}
            </label>
          ))}
          <p className="text-xs text-zinc-500">Select all that apply.</p>
        </div>
      );
    }
    case "short_answer":
      return <Input value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={1000} placeholder="Your answer" className="sm:max-w-md" />;
    case "numerical":
      return <Input inputMode="decimal" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={40} placeholder="A number" className="sm:max-w-[12rem]" />;
    case "essay":
      return <Textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={7} maxLength={20000} placeholder="Write your answer" />;
    case "matching":
      return (
        <div className="space-y-2">
          {q.matchLeft!.map((l) => (
            <div key={l.id} className="grid gap-1.5 sm:grid-cols-[1fr_1fr] sm:items-center">
              <span className="text-sm text-zinc-800">{l.text}</span>
              <select className="focus-ring h-10 rounded-xl border border-border bg-white px-3 text-sm" value={map[l.id] ?? ""} disabled={disabled}
                onChange={(e) => onChange({ ...map, [l.id]: e.target.value })} aria-label={`Match for ${l.text}`}>
                <option value="">Choose…</option>
                {q.matchOptions!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function QuestionBlock({ q, n, value, onChange, disabled }: { q: PublicQuestion; n: number | null; value: Answer | undefined; onChange: (a: Answer) => void; disabled?: boolean }) {
  const map = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, string>;
  const inline = q.type === "fill_in_multiple_blanks" || q.type === "multiple_dropdowns";
  return (
    <div className="space-y-3">
      {n !== null && <p className="flex items-center justify-between text-xs font-semibold text-zinc-500"><span>Question {n}</span><span>{fmt(q.points)} pt{q.points === 1 ? "" : "s"}</span></p>}
      {inline ? (
        <Inline text={q.text} render={(name) => q.type === "fill_in_multiple_blanks"
          ? <input className="focus-ring mx-1 inline-block h-8 w-36 rounded-lg border border-border bg-white px-2 text-sm" value={map[name] ?? ""} disabled={disabled} aria-label={`Blank ${name}`}
              onChange={(e) => onChange({ ...map, [name]: e.target.value })} />
          : <select className="focus-ring mx-1 inline-block h-8 rounded-lg border border-border bg-white px-2 text-sm" value={map[name] ?? ""} disabled={disabled} aria-label={`Choice for ${name}`}
              onChange={(e) => onChange({ ...map, [name]: e.target.value })}>
              <option value="">Choose…</option>
              {q.dropdowns!.find((d) => d.name === name)?.choices.map((c) => <option key={c.id} value={c.id}>{c.text}</option>)}
            </select>} />
      ) : (
        <LessonMarkdown content={q.text} />
      )}
      <QuestionInput q={q} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

const answered = (a: Answer | undefined) => a !== undefined && a !== "" && !(Array.isArray(a) && !a.length) && !(typeof a === "object" && !Array.isArray(a) && !Object.values(a).some((v) => String(v).trim()));

function Runner({ panel, onDone }: { panel: NonNullable<LearnerQuiz["inProgress"]> & { oneAtATime: boolean; cantGoBack: boolean }; onDone: (next: LearnerQuiz) => void }) {
  const [answers, setAnswers] = useState<Answers>(panel.answers ?? {});
  const [index, setIndex] = useState(0);
  const [locked, setLocked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const [left, setLeft] = useState<number | null>(panel.deadline ? Date.parse(panel.deadline) - Date.now() : null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const questions = panel.questions;
  const numbered = useMemo(() => { let n = 0; return questions.map((q) => (q.type === "text_only" ? null : ++n)); }, [questions]);

  const handingIn = useRef(false);
  const submit = useCallback(async () => {
    if (handingIn.current) return;   // the timer and the button can't both hand in
    handingIn.current = true;
    if (pending.current) clearTimeout(pending.current);
    setBusy(true); setError(null);
    try { onDone(await call("PUT", "/api/quiz/attempt", { attemptId: panel.attemptId, answers: answersRef.current }) as LearnerQuiz); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't hand in. Try again."); handingIn.current = false; }
    finally { setBusy(false); }
  }, [panel.attemptId, onDone]);

  useEffect(() => {
    if (!panel.deadline) return;
    const tick = () => {
      const ms = Date.parse(panel.deadline!) - Date.now();
      setLeft(ms);
      if (ms <= 0) void submit();
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [panel.deadline, submit]);

  function change(id: string, a: Answer) {
    const next = { ...answersRef.current, [id]: a };
    setAnswers(next);
    setSaved("saving");
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      call("PATCH", "/api/quiz/attempt", { attemptId: panel.attemptId, answers: next }).then(() => setSaved("saved")).catch(() => setSaved("idle"));
    }, 1200);
  }

  const unanswered = questions.filter((q) => q.type !== "text_only" && !answered(answers[q.id])).length;
  const finish = async () => {
    if (unanswered && !(await askConfirm(`${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered. Hand in anyway?`, { confirmLabel: "Hand in" }))) return;
    void submit();
  };
  const timeText = left !== null ? `${Math.max(0, Math.floor(left / 60000))}:${String(Math.max(0, Math.floor((left % 60000) / 1000))).padStart(2, "0")}` : null;
  const shown = panel.oneAtATime ? [questions[index]] : questions;

  return (
    <div className="space-y-4">
      <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
        <span className="font-semibold text-zinc-800">Attempt {panel.number}</span>
        <span className="flex items-center gap-3 text-xs text-zinc-500">
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : null}
          {timeText && <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", (left ?? 0) < 60000 ? "bg-red-50 text-red-700" : "bg-zinc-100 text-zinc-700")}><Clock className="h-3.5 w-3.5" />{timeText}</span>}
        </span>
      </div>
      {shown.map((q) => {
        const i = questions.indexOf(q);
        return (
          <div key={q.id} className={cn("rounded-2xl border p-4", q.type === "text_only" ? "border-zinc-100 bg-zinc-50" : "border-zinc-200 bg-white")}>
            <QuestionBlock q={q} n={numbered[i]} value={answers[q.id]} onChange={(a) => change(q.id, a)} disabled={busy || (panel.cantGoBack && i < locked)} />
          </div>
        );
      })}
      {error && <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {panel.oneAtATime ? (
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={index === 0 || panel.cantGoBack} onClick={() => setIndex((i) => i - 1)}><ArrowLeft className="h-3.5 w-3.5" />Previous</Button>
            <span className="text-xs text-zinc-500">{index + 1} of {questions.length}</span>
            <Button type="button" variant="outline" size="sm" disabled={index >= questions.length - 1} onClick={() => { setLocked(Math.max(locked, index + 1)); setIndex((i) => i + 1); }}>Next<ArrowRight className="h-3.5 w-3.5" /></Button>
          </span>
        ) : <span className="text-xs text-zinc-500">{unanswered ? `${unanswered} unanswered` : "All answered"}</span>}
        <Button type="button" onClick={() => void finish()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}Hand in quiz</Button>
      </div>
    </div>
  );
}

const STATUS: Record<ResultQuestion["status"], { text: string; icon: typeof CheckCircle2; cls: string }> = {
  correct: { text: "Correct", icon: CheckCircle2, cls: "text-emerald-700" },
  partial: { text: "Partly correct", icon: MinusCircle, cls: "text-amber-700" },
  incorrect: { text: "Incorrect", icon: XCircle, cls: "text-red-700" },
  pending: { text: "Waiting for your tutor", icon: Hourglass, cls: "text-zinc-600" },
  unanswered: { text: "Not answered", icon: MinusCircle, cls: "text-zinc-500" },
  info: { text: "", icon: CheckCircle2, cls: "" },
};

function answerText(q: ResultQuestion): string {
  const a = q.answer;
  if (a === null || a === undefined || a === "") return "—";
  if (q.choices) return (Array.isArray(a) ? a : [a as string]).map((id) => q.choices!.find((c) => c.id === id)?.text ?? id).join("; ") || "—";
  if (typeof a === "object" && !Array.isArray(a)) {
    if (q.type === "matching") return (q.matchLeft ?? []).map((l) => `${l.text} → ${a[l.id] || "—"}`).join("; ");
    if (q.type === "multiple_dropdowns") return Object.entries(a).map(([k, v]) => `[${k}] ${q.dropdowns?.find((d) => d.name === k)?.choices.find((c) => c.id === v)?.text ?? "—"}`).join("; ");
    return Object.entries(a).map(([k, v]) => `[${k}] ${v || "—"}`).join("; ");
  }
  return String(a);
}

function Results({ result }: { result: NonNullable<LearnerQuiz["result"]> }) {
  let n = 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-700">
        Attempt {result.number}: <b className="text-zinc-900">{result.score === null ? "—" : fmt(result.score)} / {fmt(result.maxScore)}</b>
        {result.pending && <span className="ml-2 text-xs text-zinc-500">(some answers are waiting for your tutor)</span>}
      </p>
      {result.questions === null ? <p className="text-xs text-zinc-500">Your tutor hasn&apos;t made the answers visible for this quiz.</p> : (
        <ol className="space-y-2.5">
          {result.questions.map((q) => {
            if (q.type === "text_only") return null;
            n += 1;
            const s = STATUS[q.status];
            return (
              <li key={q.id} className="rounded-xl border border-zinc-200 bg-white p-3.5">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span className="text-zinc-500">Question {n}</span>
                  <span className={cn("flex items-center gap-1", s.cls)}><s.icon className="h-3.5 w-3.5" />{s.text} · {fmt(q.earned)} / {fmt(q.points)}</span>
                </div>
                <div className="mt-1.5 text-sm text-zinc-800">{q.type === "fill_in_multiple_blanks" || q.type === "multiple_dropdowns" ? <p className="whitespace-pre-line">{q.text}</p> : <LessonMarkdown content={q.text} />}</div>
                <p className="mt-1.5 text-sm"><span className="text-zinc-500">Your answer:</span> <span className="whitespace-pre-line text-zinc-800">{answerText(q)}</span></p>
                {q.correctAnswer && q.status !== "correct" && <p className="text-sm"><span className="text-zinc-500">Correct answer:</span> <span className="font-medium text-emerald-800">{q.correctAnswer}</span></p>}
                {q.feedback && <p className="mt-1.5 whitespace-pre-line rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600">{q.feedback}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function QuizPanel({ lessonId }: { lessonId: string }) {
  const [data, setData] = useState<LearnerQuiz | { quiz: null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (attempt?: number) => {
    try { setData(await call("GET", `/api/quiz/lesson?lessonId=${encodeURIComponent(lessonId)}${attempt ? `&attempt=${attempt}` : ""}`)); }
    catch { setData({ quiz: null }); }
  }, [lessonId]);
  useEffect(() => { setData(null); void load(); }, [load]);

  if (!data || !data.quiz) return null;
  const d = data as LearnerQuiz;
  const q = d.quiz;
  const start = async () => {
    setBusy(true); setError(null);
    try { setData(await call("POST", "/api/quiz/attempt", { lessonId }) as LearnerQuiz); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't start the quiz."); }
    finally { setBusy(false); }
  };
  const facts = [
    `${q.questionCount} question${q.questionCount === 1 ? "" : "s"}`, `${fmt(q.points)} points`,
    q.timeLimitMin ? `${q.timeLimitMin} min` : "No time limit",
    q.allowedAttempts === null ? "Unlimited attempts" : `${q.allowedAttempts} attempt${q.allowedAttempts === 1 ? "" : "s"}`,
    ...(q.dueDate ? [`Due ${date(q.dueDate)}`] : []),
  ];

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/[0.02] p-5" aria-label="Quiz">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-base font-semibold text-zinc-900"><ClipboardCheck className="h-4 w-4 text-primary" />Quiz</p>
          <p className="mt-1 text-xs text-zinc-500">{facts.join(" · ")}</p>
        </div>
        {d.kept !== null && <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">Score {fmt(d.kept)} / {fmt(q.points)}</span>}
      </div>
      {q.instructions && <div className="mt-3"><LessonMarkdown content={q.instructions} /></div>}

      <div className="mt-4">
        {d.inProgress ? (
          <Runner panel={{ ...d.inProgress, oneAtATime: q.oneQuestionAtATime, cantGoBack: q.cantGoBack }} onDone={(next) => setData(next)} />
        ) : (
          <div className="space-y-4">
            {d.attempts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {d.attempts.map((a) => (
                  <button key={a.number} type="button" onClick={() => void load(a.number)}
                    className={cn("focus-ring rounded-full border px-2.5 py-1 font-semibold", d.result?.number === a.number ? "border-primary bg-primary/10 text-primary" : "border-zinc-200 text-zinc-600 hover:border-zinc-300")}>
                    Attempt {a.number}: {a.score === null ? "—" : fmt(a.score)}/{fmt(a.maxScore)}{a.pending ? " (pending)" : ""}{a.late ? " · Late" : ""}
                  </button>
                ))}
                <span className="text-zinc-500">{q.allowedAttempts !== 1 && `Counts: ${q.scoringPolicy === "keep_latest" ? "latest" : q.scoringPolicy === "keep_average" ? "average" : "highest"}.`}{d.attemptsLeft !== null ? ` ${d.attemptsLeft} attempt${d.attemptsLeft === 1 ? "" : "s"} left.` : ""}</span>
              </div>
            )}
            {d.result && <Results result={d.result} />}
            {d.canStart && (
              <Button type="button" onClick={() => void start()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                {d.attempts.length ? "Take the quiz again" : "Take the quiz"}
              </Button>
            )}
            {q.timeLimitMin && d.canStart && <p className="text-xs text-zinc-500">The timer starts when you begin and keeps running if you leave; your answers save as you go.</p>}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
