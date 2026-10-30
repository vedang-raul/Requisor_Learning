"use client";

/**
 * The quiz builder in step 3 of the lesson wizard ("Quiz"): Canvas-style
 * settings and questions of every main Canvas type. The quiz is saved right
 * after the lesson (see /api/tutor/lesson-quiz). checkQuiz() is the same check
 * the server runs, so problems show here before saving.
 */
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, MessageSquareText, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  blankNames, checkQuiz, DEFAULT_SETTINGS, QUESTION_TYPE_LABELS, QUESTION_TYPES,
  type Choice, type NumericAnswer, type Question, type QuestionType, type Quiz, type QuizSettings,
} from "@/lib/quiz/quiz";

export const emptyQuiz = (): Quiz => ({ settings: { ...DEFAULT_SETTINGS }, questions: [] });
const newId = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`;

export function newQuestion(type: QuestionType): Question {
  const base = { id: newId("q"), type, text: "", points: type === "text_only" ? 0 : 1 };
  switch (type) {
    case "multiple_choice": return { ...base, choices: [{ id: newId("c"), text: "", correct: true }, { id: newId("c"), text: "", correct: false }] };
    case "true_false": return { ...base, choices: [{ id: "true", text: "True", correct: true }, { id: "false", text: "False", correct: false }] };
    case "multiple_answers": return { ...base, choices: [{ id: newId("c"), text: "", correct: true }, { id: newId("c"), text: "", correct: false }] };
    case "short_answer": return { ...base, answers: [""] };
    case "fill_in_multiple_blanks": return { ...base, text: "Roses are [color1], violets are [color2].", blanks: [] };
    case "multiple_dropdowns": return { ...base, text: "The capital of France is [city].", dropdowns: [] };
    case "matching": return { ...base, pairs: [{ id: newId("p"), left: "", right: "" }, { id: newId("p"), left: "", right: "" }] };
    case "numerical": return { ...base, numeric: [{ kind: "exact", value: 0, margin: 0 }] };
    default: return base;
  }
}

const label = "text-xs font-semibold text-zinc-600";
const small = "focus-ring h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-zinc-900";

function Toggle({ on, onChange, title, hint }: { on: boolean; onChange: (v: boolean) => void; title: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2">
      <span><span className="block text-sm font-medium text-zinc-800">{title}</span>{hint && <span className="block text-xs text-zinc-500">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={title} onClick={() => onChange(!on)}
        className={cn("focus-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition", on ? "bg-primary" : "bg-zinc-300")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

/** A list of short texts (accepted answers, distractors). */
function TextList({ values, onChange, placeholder, addLabel, min = 1 }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; addLabel: string; min?: number }) {
  return (
    <div className="space-y-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex gap-1.5">
          <Input value={v} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} placeholder={placeholder} maxLength={1000} />
          <button type="button" disabled={values.length <= min} onClick={() => onChange(values.filter((_, j) => j !== i))} aria-label="Remove"
            className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...values, ""])} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5">
        <Plus className="h-3.5 w-3.5" />{addLabel}
      </button>
    </div>
  );
}

/** Answer choices with the right one(s) marked. */
function ChoiceList({ choices, onChange, many, fixed }: { choices: Choice[]; onChange: (c: Choice[]) => void; many: boolean; fixed?: boolean }) {
  const mark = (i: number) => onChange(choices.map((c, j) => (many ? (j === i ? { ...c, correct: !c.correct } : c) : { ...c, correct: j === i })));
  return (
    <div className="space-y-1.5">
      {choices.map((c, i) => (
        <div key={c.id} className="flex items-center gap-1.5">
          <button type="button" role={many ? "checkbox" : "radio"} aria-checked={c.correct} onClick={() => mark(i)} title={c.correct ? "Correct answer" : "Mark as correct"}
            className={cn("focus-ring flex h-8 w-8 shrink-0 items-center justify-center border-2 transition", many ? "rounded-md" : "rounded-full",
              c.correct ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 text-transparent hover:border-emerald-500")}>
            <Check className="h-4 w-4" />
          </button>
          {fixed ? <span className="px-2 text-sm font-medium text-zinc-800">{c.text}</span> : (
            <Input value={c.text} onChange={(e) => onChange(choices.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder={`Answer ${i + 1}`} maxLength={1000} />
          )}
          {!fixed && (
            <button type="button" disabled={choices.length <= 2} onClick={() => onChange(choices.filter((_, j) => j !== i))} aria-label={`Remove answer ${i + 1}`}
              className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      {!fixed && (
        <button type="button" onClick={() => onChange([...choices, { id: newId("c"), text: "", correct: false }])} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5">
          <Plus className="h-3.5 w-3.5" />Add answer
        </button>
      )}
      <p className="text-xs text-zinc-500">{many ? "Tick every correct answer. Learners get partial credit, as in Canvas." : "Click the circle to mark the correct answer."}</p>
    </div>
  );
}

function TypeEditor({ q, set }: { q: Question; set: (patch: Partial<Question>) => void }) {
  switch (q.type) {
    case "multiple_choice": case "multiple_answers": case "true_false":
      return <ChoiceList choices={q.choices ?? []} onChange={(choices) => set({ choices })} many={q.type === "multiple_answers"} fixed={q.type === "true_false"} />;
    case "short_answer":
      return <div><p className={label}>Accepted answers (any of these is right; capitals and spaces don&apos;t matter)</p><div className="mt-1.5"><TextList values={q.answers ?? [""]} onChange={(answers) => set({ answers })} placeholder="An accepted answer" addLabel="Add another accepted answer" /></div></div>;
    case "fill_in_multiple_blanks": {
      const names = blankNames(q.text);
      return names.length === 0 ? <p className="text-xs text-amber-700">Write each blank in the question in square brackets, like [city].</p> : (
        <div className="space-y-3">
          {names.map((name) => {
            const answers = q.blanks?.find((b) => b.name === name)?.answers ?? [""];
            return (
              <div key={name}><p className={label}>Accepted answers for [{name}]</p><div className="mt-1.5">
                <TextList values={answers.length ? answers : [""]} placeholder={`Answer for [${name}]`} addLabel="Add another"
                  onChange={(next) => set({ blanks: names.map((n) => ({ name: n, answers: n === name ? next : q.blanks?.find((b) => b.name === n)?.answers ?? [""] })) })} />
              </div></div>
            );
          })}
        </div>
      );
    }
    case "multiple_dropdowns": {
      const names = blankNames(q.text);
      return names.length === 0 ? <p className="text-xs text-amber-700">Write each dropdown in the question in square brackets, like [city].</p> : (
        <div className="space-y-3">
          {names.map((name) => {
            const choices = q.dropdowns?.find((d) => d.name === name)?.choices ?? [{ id: newId("c"), text: "", correct: true }, { id: newId("c"), text: "", correct: false }];
            return (
              <div key={name}><p className={label}>Options for [{name}]</p><div className="mt-1.5">
                <ChoiceList choices={choices} many={false}
                  onChange={(next) => set({ dropdowns: names.map((n) => ({ name: n, choices: n === name ? next : q.dropdowns?.find((d) => d.name === n)?.choices ?? [] })) })} />
              </div></div>
            );
          })}
        </div>
      );
    }
    case "matching": {
      const pairs = q.pairs ?? [];
      return (
        <div className="space-y-2">
          <p className={label}>Pairs (learners match each left item to its right one)</p>
          {pairs.map((p, i) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
              <Input value={p.left} onChange={(e) => set({ pairs: pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} placeholder="Left" maxLength={1000} />
              <span className="text-zinc-400">→</span>
              <Input value={p.right} onChange={(e) => set({ pairs: pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} placeholder="Matches" maxLength={1000} />
              <button type="button" disabled={pairs.length <= 2} onClick={() => set({ pairs: pairs.filter((_, j) => j !== i) })} aria-label={`Remove pair ${i + 1}`}
                className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => set({ pairs: [...pairs, { id: newId("p"), left: "", right: "" }] })} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" />Add pair</button>
          <div><p className={label}>Extra wrong matches (optional)</p><div className="mt-1.5"><TextList values={q.distractors ?? []} min={0} onChange={(distractors) => set({ distractors })} placeholder="A wrong option" addLabel="Add a wrong option" /></div></div>
        </div>
      );
    }
    case "numerical": {
      const answers = q.numeric ?? [];
      const update = (i: number, a: NumericAnswer) => set({ numeric: answers.map((x, j) => (j === i ? a : x)) });
      return (
        <div className="space-y-2">
          <p className={label}>Correct answers (any one matches)</p>
          {answers.map((a, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <select className={small} value={a.kind} onChange={(e) => update(i, e.target.value === "range" ? { kind: "range", min: 0, max: 0 } : { kind: "exact", value: 0, margin: 0 })}>
                <option value="exact">Exact answer</option><option value="range">Answer in range</option>
              </select>
              {a.kind === "exact" ? (<>
                <input type="number" step="any" className={cn(small, "w-28")} value={a.value} onChange={(e) => update(i, { ...a, value: Number(e.target.value) })} aria-label="Answer" />
                <span className="text-sm text-zinc-500">±</span>
                <input type="number" step="any" min="0" className={cn(small, "w-24")} value={a.margin} onChange={(e) => update(i, { ...a, margin: Number(e.target.value) })} aria-label="Margin of error" />
              </>) : (<>
                <input type="number" step="any" className={cn(small, "w-28")} value={a.min} onChange={(e) => update(i, { ...a, min: Number(e.target.value) })} aria-label="From" />
                <span className="text-sm text-zinc-500">to</span>
                <input type="number" step="any" className={cn(small, "w-28")} value={a.max} onChange={(e) => update(i, { ...a, max: Number(e.target.value) })} aria-label="To" />
              </>)}
              <button type="button" disabled={answers.length <= 1} onClick={() => set({ numeric: answers.filter((_, j) => j !== i) })} aria-label="Remove"
                className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => set({ numeric: [...answers, { kind: "exact", value: 0, margin: 0 }] })} className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"><Plus className="h-3.5 w-3.5" />Add another answer</button>
        </div>
      );
    }
    case "essay":
      return <p className="text-xs text-zinc-500">Learners write an answer. You give the points when you check it in Check assignments.</p>;
    default:
      return <p className="text-xs text-zinc-500">Information shown between questions. No answer and no points.</p>;
  }
}

function QuestionCard({ q, index, number, count, onChange, onMove, onCopy, onRemove }: {
  q: Question; index: number; number: number; count: number; onChange: (q: Question) => void; onMove: (d: -1 | 1) => void; onCopy: () => void; onRemove: () => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(Boolean(q.feedback));
  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });
  const changeType = (type: QuestionType) => {
    const fresh = newQuestion(type);
    onChange({ ...fresh, id: q.id, text: q.text || fresh.text, points: type === "text_only" ? 0 : q.points || 1, ...(q.feedback ? { feedback: q.feedback } : {}) });
  };
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600">{q.type === "text_only" ? "Text" : `Question ${number}`}</span>
          <select className={small} value={q.type} onChange={(e) => changeType(e.target.value as QuestionType)} aria-label="Question type">
            {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          {q.type !== "text_only" && (
            <label className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
              Points<input type="number" min="0" max="1000" step="0.5" value={q.points} onChange={(e) => set({ points: Number(e.target.value) })} className={cn(small, "w-20 tabular-nums")} />
            </label>
          )}
          <button type="button" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up" className="focus-ring rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Move down" className="focus-ring rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={onCopy} aria-label="Duplicate question" className="focus-ring rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"><Copy className="h-4 w-4" /></button>
          <button type="button" onClick={onRemove} aria-label="Delete question" className="focus-ring rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      <Textarea value={q.text} onChange={(e) => set({ text: e.target.value })} rows={2} maxLength={5000} className="mt-3"
        placeholder={q.type === "text_only" ? "Information for learners" : q.type === "fill_in_multiple_blanks" || q.type === "multiple_dropdowns" ? "Write the sentence with [blanks] in square brackets" : "The question"} />
      <div className="mt-3">
        <TypeEditor q={q} set={set} />
      </div>
      {q.type !== "text_only" && (
        <div className="mt-3 border-t border-zinc-100 pt-2">
          <button type="button" onClick={() => setFeedbackOpen((v) => !v)} className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-zinc-600 hover:text-zinc-900">
            <MessageSquareText className="h-3.5 w-3.5" />Feedback (optional)<ChevronDown className={cn("h-3.5 w-3.5 transition", feedbackOpen && "rotate-180")} />
          </button>
          {feedbackOpen && (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["correct", "incorrect", "general"] as const).map((k) => (
                <Textarea key={k} rows={2} maxLength={2000} value={q.feedback?.[k] ?? ""} placeholder={k === "correct" ? "When right" : k === "incorrect" ? "When wrong" : "Always"}
                  onChange={(e) => set({ feedback: { ...q.feedback, [k]: e.target.value } })} className="text-xs" />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function QuizBuilder({ value, onChange }: { value: Quiz; onChange: (q: Quiz) => void }) {
  const s = value.settings;
  const setS = (patch: Partial<QuizSettings>) => onChange({ ...value, settings: { ...s, ...patch } });
  const setQ = (questions: Question[]) => onChange({ ...value, questions });
  const [adding, setAdding] = useState(false);
  const check = value.questions.length ? checkQuiz(value) : null;
  const total = value.questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
  const attemptsChoice = s.allowedAttempts === null ? "unlimited" : String(s.allowedAttempts);
  const section = (title: string, children: ReactNode) => (
    <div className="space-y-3 rounded-2xl border border-border bg-white p-4"><p className="text-base font-semibold text-zinc-900">{title}</p>{children}</div>
  );

  return (
    <div className="space-y-4">
      {section("Quiz settings", <>
        <div>
          <p className={label}>Instructions (optional)</p>
          <Textarea className="mt-1" rows={3} maxLength={10000} value={s.instructions} onChange={(e) => setS({ instructions: e.target.value })} placeholder="What learners should know before they start" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className={label}>Due date</span><Input type="date" className="mt-1" value={s.dueDate ?? ""} onChange={(e) => setS({ dueDate: e.target.value || null })} /></label>
          <label className="block"><span className={label}>Time limit (minutes)</span>
            <Input type="number" min="1" max="1440" className="mt-1" value={s.timeLimitMin ?? ""} placeholder="No limit" onChange={(e) => setS({ timeLimitMin: e.target.value ? Number(e.target.value) : null })} /></label>
          <label className="block"><span className={label}>Attempts allowed</span>
            <select className={cn(small, "mt-1 h-10 w-full")} value={attemptsChoice} onChange={(e) => setS({ allowedAttempts: e.target.value === "unlimited" ? null : Number(e.target.value) })}>
              {["1", "2", "3", "5", "10"].map((n) => <option key={n} value={n}>{n}</option>)}
              {!["1", "2", "3", "5", "10", "unlimited"].includes(attemptsChoice) && <option value={attemptsChoice}>{attemptsChoice}</option>}
              <option value="unlimited">Unlimited</option>
            </select></label>
        </div>
        {s.allowedAttempts !== 1 && (
          <label className="block sm:max-w-xs"><span className={label}>Score that counts</span>
            <select className={cn(small, "mt-1 h-10 w-full")} value={s.scoringPolicy} onChange={(e) => setS({ scoringPolicy: e.target.value as QuizSettings["scoringPolicy"] })}>
              <option value="keep_highest">Highest</option><option value="keep_latest">Latest</option><option value="keep_average">Average</option>
            </select></label>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle on={s.shuffleAnswers} onChange={(v) => setS({ shuffleAnswers: v })} title="Shuffle answers" hint="Each learner sees the answers in a different order" />
          <Toggle on={s.shuffleQuestions} onChange={(v) => setS({ shuffleQuestions: v })} title="Shuffle questions" />
          <Toggle on={s.oneQuestionAtATime} onChange={(v) => setS({ oneQuestionAtATime: v, cantGoBack: v && s.cantGoBack })} title="One question at a time" />
          {s.oneQuestionAtATime && <Toggle on={s.cantGoBack} onChange={(v) => setS({ cantGoBack: v })} title="Lock questions after answering" hint="Learners can't go back" />}
          <Toggle on={s.showResults} onChange={(v) => setS({ showResults: v })} title="Show learners their responses" hint="Which questions they got right" />
        </div>
        {s.showResults && (
          <label className="block sm:max-w-sm"><span className={label}>Show the correct answers</span>
            <select className={cn(small, "mt-1 h-10 w-full")} value={s.showCorrectAnswers} onChange={(e) => setS({ showCorrectAnswers: e.target.value as QuizSettings["showCorrectAnswers"] })}>
              <option value="after_last_attempt">After their last attempt</option><option value="after_each_attempt">After each attempt</option><option value="never">Never</option>
            </select></label>
        )}
      </>)}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-base font-semibold text-zinc-900">Questions <span className="font-normal text-zinc-500">· {value.questions.filter((q) => q.type !== "text_only").length} · {Math.round(total * 100) / 100} points</span></p>
        </div>
        {value.questions.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">No questions yet. Add the first one below.</p>}
        <ol className="space-y-3">
          {value.questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} number={value.questions.slice(0, i + 1).filter((x) => x.type !== "text_only").length} count={value.questions.length}
              onChange={(next) => setQ(value.questions.map((x) => (x.id === q.id ? next : x)))}
              onMove={(d) => { const next = [...value.questions]; [next[i], next[i + d]] = [next[i + d], next[i]]; setQ(next); }}
              onCopy={() => { const copy = JSON.parse(JSON.stringify(q)) as Question; copy.id = newId("q"); const next = [...value.questions]; next.splice(i + 1, 0, copy); setQ(next); }}
              onRemove={() => setQ(value.questions.filter((x) => x.id !== q.id))} />
          ))}
        </ol>
        <div className="relative">
          <Button type="button" variant="outline" onClick={() => setAdding((v) => !v)} aria-expanded={adding}><Plus className="h-4 w-4" />Add question</Button>
          {adding && (
            <div className="mt-2 grid gap-1.5 rounded-2xl border border-zinc-200 bg-white p-2 shadow-lg sm:grid-cols-2">
              {QUESTION_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => { setQ([...value.questions, newQuestion(t)]); setAdding(false); }}
                  className="focus-ring rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-primary/5 hover:text-primary">{QUESTION_TYPE_LABELS[t]}</button>
              ))}
            </div>
          )}
        </div>
        {check && !check.ok && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{check.error}</p>}
      </div>
    </div>
  );
}
