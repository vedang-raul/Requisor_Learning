/**
 * Graded quizzes, modelled on Canvas Classic Quizzes so Canvas exports import
 * one-to-one. A quiz is one of a lesson's assessment options (step 3 of the
 * lesson wizard). Pure code: the shape, the check of what may be saved,
 * scoring, and what a learner is allowed to see. Storage is in quiz-store.ts.
 *
 * Question types (Canvas names in brackets):
 *   multiple_choice        one right choice                [multiple_choice_question]
 *   true_false             True / False                     [true_false_question]
 *   multiple_answers       tick every right choice          [multiple_answers_question]
 *   short_answer           type a word or phrase            [short_answer_question, "fill in the blank"]
 *   fill_in_multiple_blanks  several [blanks] in one text   [fill_in_multiple_blanks_question]
 *   multiple_dropdowns     a dropdown per [blank]           [multiple_dropdowns_question]
 *   matching               pair each left item with a right [matching_question]
 *   numerical              a number, exact ± margin or in a range [numerical_question]
 *   essay                  written answer, graded by the tutor [essay_question]
 *   text_only              information, no answer           [text_only_question]
 *
 * Scoring follows Canvas: multiple answers, blanks, dropdowns and matching give
 * partial credit; short answers ignore case and surrounding spaces.
 */

export const QUESTION_TYPES = [
  "multiple_choice", "true_false", "multiple_answers", "short_answer", "fill_in_multiple_blanks",
  "multiple_dropdowns", "matching", "numerical", "essay", "text_only",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  multiple_answers: "Multiple answers",
  short_answer: "Fill in the blank",
  fill_in_multiple_blanks: "Fill in multiple blanks",
  multiple_dropdowns: "Multiple dropdowns",
  matching: "Matching",
  numerical: "Numerical answer",
  essay: "Essay",
  text_only: "Text (no question)",
};

export type Choice = { id: string; text: string; correct: boolean };
export type Feedback = { correct?: string; incorrect?: string; general?: string };
export type NumericAnswer = { kind: "exact"; value: number; margin: number } | { kind: "range"; min: number; max: number };

export type Question = {
  id: string;
  type: QuestionType;
  text: string;
  points: number;
  feedback?: Feedback;
  choices?: Choice[];                                   // multiple_choice, true_false, multiple_answers
  answers?: string[];                                   // short_answer: accepted answers
  blanks?: { name: string; answers: string[] }[];       // fill_in_multiple_blanks
  dropdowns?: { name: string; choices: Choice[] }[];    // multiple_dropdowns
  pairs?: { id: string; left: string; right: string }[]; // matching
  distractors?: string[];                               // matching: extra wrong right-hand options
  numeric?: NumericAnswer[];                            // numerical: any one matches
};

export type ShowCorrect = "never" | "after_each_attempt" | "after_last_attempt";
export type ScoringPolicy = "keep_highest" | "keep_latest" | "keep_average";

export type QuizSettings = {
  instructions: string;
  timeLimitMin: number | null;       // null: no limit
  allowedAttempts: number | null;    // null: unlimited
  scoringPolicy: ScoringPolicy;
  shuffleAnswers: boolean;
  shuffleQuestions: boolean;
  oneQuestionAtATime: boolean;
  cantGoBack: boolean;               // with one question at a time
  showResults: boolean;              // learners see which questions they got right
  showCorrectAnswers: ShowCorrect;
  dueDate: string | null;            // YYYY-MM-DD
};

export type Quiz = { settings: QuizSettings; questions: Question[] };

/** A learner's answer: a choice id, the ids ticked, typed text, or {blank/left item: answer}. */
export type Answer = string | string[] | Record<string, string>;
export type Answers = Record<string, Answer>;

export const DEFAULT_SETTINGS: QuizSettings = {
  instructions: "", timeLimitMin: null, allowedAttempts: 1, scoringPolicy: "keep_highest",
  shuffleAnswers: false, shuffleQuestions: false, oneQuestionAtATime: false, cantGoBack: false,
  showResults: true, showCorrectAnswers: "after_last_attempt", dueDate: null,
};

export const LIMITS = { questions: 200, choices: 30, text: 5000, option: 1000, feedback: 2000, instructions: 10_000, points: 1000, blanks: 30 };

// ── Validation ──────────────────────────────────────────────────────────────
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const id = (v: unknown, fallback: string) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : fallback);
const BLANK = /\[([A-Za-z0-9_ -]{1,40})\]/g;

/** The [names] in a question's text, in order, once each. */
export function blankNames(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(BLANK)) if (!out.includes(m[1].trim())) out.push(m[1].trim());
  return out;
}

function cleanChoices(raw: unknown, prefix: string): Choice[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, LIMITS.choices).flatMap((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const text = str(o.text, LIMITS.option);
    let cid = id(o.id, `${prefix}${i + 1}`);
    if (seen.has(cid)) cid = `${prefix}${i + 1}-${seen.size}`;
    seen.add(cid);
    return text ? [{ id: cid, text, correct: o.correct === true }] : [];
  });
}

function cleanFeedback(raw: unknown): Feedback | undefined {
  const o = (raw ?? {}) as Record<string, unknown>;
  const f: Feedback = {};
  for (const k of ["correct", "incorrect", "general"] as const) {
    const t = str(o[k], LIMITS.feedback);
    if (t) f[k] = t;
  }
  return Object.keys(f).length ? f : undefined;
}

export type CheckResult = { ok: true; quiz: Quiz; points: number } | { ok: false; error: string };

/** Cleans a quiz from a tutor or an import, or says what's wrong with it. */
export function checkQuiz(raw: unknown): CheckResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (o.settings ?? {}) as Record<string, unknown>;
  const attempts = s.allowedAttempts === null ? null : Math.round(num(s.allowedAttempts));
  const time = s.timeLimitMin === null || s.timeLimitMin === undefined || s.timeLimitMin === "" ? null : Math.round(num(s.timeLimitMin));
  const due = typeof s.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.dueDate) ? s.dueDate : null;
  const settings: QuizSettings = {
    instructions: str(s.instructions, LIMITS.instructions),
    timeLimitMin: time !== null && Number.isFinite(time) && time >= 1 && time <= 1440 ? time : null,
    allowedAttempts: attempts === null || !Number.isFinite(attempts) || attempts < 1 ? (s.allowedAttempts === null ? null : 1) : Math.min(attempts, 100),
    scoringPolicy: (["keep_highest", "keep_latest", "keep_average"] as const).includes(s.scoringPolicy as ScoringPolicy) ? (s.scoringPolicy as ScoringPolicy) : "keep_highest",
    shuffleAnswers: s.shuffleAnswers === true,
    shuffleQuestions: s.shuffleQuestions === true,
    oneQuestionAtATime: s.oneQuestionAtATime === true,
    cantGoBack: s.oneQuestionAtATime === true && s.cantGoBack === true,
    showResults: s.showResults !== false,
    showCorrectAnswers: (["never", "after_each_attempt", "after_last_attempt"] as const).includes(s.showCorrectAnswers as ShowCorrect) ? (s.showCorrectAnswers as ShowCorrect) : "after_last_attempt",
    dueDate: due,
  };

  if (!Array.isArray(o.questions) || o.questions.length === 0) return { ok: false, error: "Add at least one question." };
  if (o.questions.length > LIMITS.questions) return { ok: false, error: `A quiz can have at most ${LIMITS.questions} questions.` };
  const questions: Question[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < o.questions.length; i++) {
    const q = (o.questions[i] ?? {}) as Record<string, unknown>;
    const n = i + 1;
    const type = q.type as QuestionType;
    if (!QUESTION_TYPES.includes(type)) return { ok: false, error: `Question ${n} has an unknown type.` };
    const text = str(q.text, LIMITS.text);
    if (!text) return { ok: false, error: `Question ${n} needs its text.` };
    const pts = type === "text_only" ? 0 : num(q.points);
    if (!Number.isFinite(pts) || pts < 0 || pts > LIMITS.points) return { ok: false, error: `Question ${n}: points must be between 0 and ${LIMITS.points}.` };
    let qid = id(q.id, `q${n}`);
    if (ids.has(qid)) qid = `q${n}-${ids.size}`;
    ids.add(qid);
    const base: Question = { id: qid, type, text, points: Math.round(pts * 100) / 100 };
    const feedback = cleanFeedback(q.feedback);
    if (feedback) base.feedback = feedback;

    if (type === "multiple_choice" || type === "true_false" || type === "multiple_answers") {
      const choices = type === "true_false" && !Array.isArray(q.choices)
        ? [{ id: "true", text: "True", correct: q.correct === true }, { id: "false", text: "False", correct: q.correct === false }]
        : cleanChoices(q.choices, "c");
      if (choices.length < 2) return { ok: false, error: `Question ${n} needs at least two answers.` };
      const right = choices.filter((c) => c.correct).length;
      if (type !== "multiple_answers" && right !== 1) return { ok: false, error: `Question ${n}: mark exactly one answer as correct.` };
      if (type === "multiple_answers" && right < 1) return { ok: false, error: `Question ${n}: mark at least one answer as correct.` };
      base.choices = choices;
    } else if (type === "short_answer") {
      const answers = (Array.isArray(q.answers) ? q.answers : []).map((a) => str(a, LIMITS.option)).filter(Boolean).slice(0, LIMITS.choices);
      if (!answers.length) return { ok: false, error: `Question ${n}: add at least one accepted answer.` };
      base.answers = answers;
    } else if (type === "fill_in_multiple_blanks") {
      const names = blankNames(text);
      if (!names.length) return { ok: false, error: `Question ${n}: put each blank in the text in square brackets, like [city].` };
      const given = Array.isArray(q.blanks) ? (q.blanks as Record<string, unknown>[]) : [];
      base.blanks = names.slice(0, LIMITS.blanks).map((name) => {
        const b = given.find((g) => str(g?.name, 40) === name);
        return { name, answers: (Array.isArray(b?.answers) ? b.answers : []).map((a) => str(a, LIMITS.option)).filter(Boolean).slice(0, LIMITS.choices) };
      });
      const missing = base.blanks.find((b) => !b.answers.length);
      if (missing) return { ok: false, error: `Question ${n}: add an accepted answer for [${missing.name}].` };
    } else if (type === "multiple_dropdowns") {
      const names = blankNames(text);
      if (!names.length) return { ok: false, error: `Question ${n}: put each dropdown in the text in square brackets, like [color].` };
      const given = Array.isArray(q.dropdowns) ? (q.dropdowns as Record<string, unknown>[]) : [];
      base.dropdowns = names.slice(0, LIMITS.blanks).map((name) => {
        const d = given.find((g) => str(g?.name, 40) === name);
        return { name, choices: cleanChoices(d?.choices, `${name.replace(/[^A-Za-z0-9_-]/g, "")}-`) };
      });
      const bad = base.dropdowns.find((d) => d.choices.length < 2 || d.choices.filter((c) => c.correct).length !== 1);
      if (bad) return { ok: false, error: `Question ${n}: [${bad.name}] needs at least two options with exactly one correct.` };
    } else if (type === "matching") {
      const pairs = (Array.isArray(q.pairs) ? q.pairs : []).slice(0, LIMITS.choices).flatMap((p, j) => {
        const o2 = (p ?? {}) as Record<string, unknown>;
        const left = str(o2.left, LIMITS.option), right = str(o2.right, LIMITS.option);
        return left && right ? [{ id: id(o2.id, `p${j + 1}`), left, right }] : [];
      });
      if (pairs.length < 2) return { ok: false, error: `Question ${n} needs at least two pairs.` };
      base.pairs = pairs;
      const distractors = (Array.isArray(q.distractors) ? q.distractors : []).map((d) => str(d, LIMITS.option)).filter(Boolean).slice(0, LIMITS.choices);
      if (distractors.length) base.distractors = distractors;
    } else if (type === "numerical") {
      const numeric = (Array.isArray(q.numeric) ? q.numeric : []).slice(0, 10).flatMap((a): NumericAnswer[] => {
        const o2 = (a ?? {}) as Record<string, unknown>;
        if (o2.kind === "range") {
          const min = num(o2.min), max = num(o2.max);
          return Number.isFinite(min) && Number.isFinite(max) && min <= max ? [{ kind: "range", min, max }] : [];
        }
        const value = num(o2.value), margin = Math.abs(num(o2.margin ?? 0)) || 0;
        return Number.isFinite(value) ? [{ kind: "exact", value, margin }] : [];
      });
      if (!numeric.length) return { ok: false, error: `Question ${n}: add the correct number (or a range).` };
      base.numeric = numeric;
    }
    questions.push(base);
  }
  const points = Math.round(questions.reduce((sum, q) => sum + q.points, 0) * 100) / 100;
  if (points <= 0 && !questions.some((q) => q.type === "essay")) return { ok: false, error: "Give at least one question some points." };
  return { ok: true, quiz: { settings, questions }, points };
}

// ── Scoring ────────────────────────────────────────────────────────────────
export type QuestionResult = { earned: number; status: "correct" | "partial" | "incorrect" | "pending" | "unanswered" | "info" };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const round = (n: number) => Math.round(n * 100) / 100;
const asText = (a: Answer | undefined) => (typeof a === "string" ? a : "");
const asList = (a: Answer | undefined) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
const asMap = (a: Answer | undefined) => (a && typeof a === "object" && !Array.isArray(a) ? a : {});

function share(points: number, right: number, total: number): QuestionResult {
  if (total === 0) return { earned: 0, status: "incorrect" };
  const earned = round(points * Math.max(0, right) / total);
  return { earned, status: right >= total ? "correct" : earned > 0 ? "partial" : "incorrect" };
}

/** Scores one answer. Essays wait for the tutor ("pending"). */
export function scoreQuestion(q: Question, answer: Answer | undefined): QuestionResult {
  const empty = answer === undefined || answer === "" || (Array.isArray(answer) && answer.length === 0)
    || (typeof answer === "object" && !Array.isArray(answer) && Object.values(answer).every((v) => !String(v ?? "").trim()));
  if (q.type === "text_only") return { earned: 0, status: "info" };
  if (q.type === "essay") return empty ? { earned: 0, status: "unanswered" } : { earned: 0, status: "pending" };
  if (empty) return { earned: 0, status: "unanswered" };
  switch (q.type) {
    case "multiple_choice":
    case "true_false": {
      const right = q.choices?.find((c) => c.correct)?.id;
      return asText(answer) === right ? { earned: q.points, status: "correct" } : { earned: 0, status: "incorrect" };
    }
    case "multiple_answers": {
      // Canvas: points × (right ticked / all right − wrong ticked / all wrong), never below zero.
      const picked = new Set(asList(answer));
      const right = q.choices!.filter((c) => c.correct), wrong = q.choices!.filter((c) => !c.correct);
      const fraction = right.filter((c) => picked.has(c.id)).length / right.length - (wrong.length ? wrong.filter((c) => picked.has(c.id)).length / wrong.length : 0);
      const earned = round(q.points * Math.max(0, fraction));
      return { earned, status: earned >= q.points ? "correct" : earned > 0 ? "partial" : "incorrect" };
    }
    case "short_answer":
      return q.answers!.some((a) => norm(a) === norm(asText(answer))) ? { earned: q.points, status: "correct" } : { earned: 0, status: "incorrect" };
    case "fill_in_multiple_blanks": {
      const given = asMap(answer);
      return share(q.points, q.blanks!.filter((b) => b.answers.some((a) => norm(a) === norm(given[b.name] ?? ""))).length, q.blanks!.length);
    }
    case "multiple_dropdowns": {
      const given = asMap(answer);
      return share(q.points, q.dropdowns!.filter((d) => d.choices.find((c) => c.correct)?.id === given[d.name]).length, q.dropdowns!.length);
    }
    case "matching": {
      const given = asMap(answer);
      return share(q.points, q.pairs!.filter((p) => norm(given[p.id] ?? "") === norm(p.right)).length, q.pairs!.length);
    }
    case "numerical": {
      const value = Number(asText(answer).replace(/,/g, "").trim());
      if (!Number.isFinite(value)) return { earned: 0, status: "incorrect" };
      const ok = q.numeric!.some((a) => (a.kind === "range" ? value >= a.min && value <= a.max : Math.abs(value - a.value) <= a.margin + 1e-9));
      return ok ? { earned: q.points, status: "correct" } : { earned: 0, status: "incorrect" };
    }
  }
  return { earned: 0, status: "incorrect" };
}

export type AttemptScore = { score: number; max: number; pending: boolean; results: Record<string, QuestionResult> };

/** Scores a whole attempt; `manual` holds the tutor's points for essays. */
export function scoreAttempt(questions: Question[], answers: Answers, manual: Record<string, number> = {}): AttemptScore {
  const results: Record<string, QuestionResult> = {};
  let score = 0, max = 0, pending = false;
  for (const q of questions) {
    let r = scoreQuestion(q, answers[q.id]);
    if (q.type === "essay" && r.status === "pending" && typeof manual[q.id] === "number") {
      const earned = round(Math.min(q.points, Math.max(0, manual[q.id])));
      r = { earned, status: earned >= q.points ? "correct" : earned > 0 ? "partial" : "incorrect" };
    }
    if (r.status === "pending") pending = true;
    results[q.id] = r;
    score += r.earned;
    max += q.points;
  }
  return { score: round(score), max: round(max), pending, results };
}

/** The score that counts, from finished attempts in order, under the quiz's policy. */
export function keptScore(policy: ScoringPolicy, scores: number[]): number | null {
  if (!scores.length) return null;
  if (policy === "keep_latest") return scores[scores.length - 1];
  if (policy === "keep_average") return round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return Math.max(...scores);
}

// ── What a learner sees ────────────────────────────────────────────────────
export type PublicQuestion = {
  id: string; type: QuestionType; text: string; points: number;
  choices?: { id: string; text: string }[];
  blanks?: string[];
  dropdowns?: { name: string; choices: { id: string; text: string }[] }[];
  matchLeft?: { id: string; text: string }[];
  matchOptions?: string[];
};

/** A deterministic shuffle (the same attempt always shows the same order). */
export function shuffled<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    const j = (h >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The questions for one attempt, without answers, in the attempt's order. */
export function publicQuestions(quiz: Quiz, seed: string): PublicQuestion[] {
  const { shuffleAnswers, shuffleQuestions } = quiz.settings;
  const order = shuffleQuestions ? shuffled(quiz.questions, `${seed}:q`) : quiz.questions;
  return order.map((q) => {
    const p: PublicQuestion = { id: q.id, type: q.type, text: q.text, points: q.points };
    const mix = <T,>(xs: T[], key: string) => (shuffleAnswers && q.type !== "true_false" ? shuffled(xs, `${seed}:${q.id}:${key}`) : xs);
    if (q.choices) p.choices = mix(q.choices.map(({ id: cid, text }) => ({ id: cid, text })), "c");
    if (q.blanks) p.blanks = q.blanks.map((b) => b.name);
    if (q.dropdowns) p.dropdowns = q.dropdowns.map((d) => ({ name: d.name, choices: mix(d.choices.map(({ id: cid, text }) => ({ id: cid, text })), d.name) }));
    if (q.pairs) {
      p.matchLeft = q.pairs.map((x) => ({ id: x.id, text: x.left }));
      // Right-hand options are always shuffled, or the answer is the list order.
      p.matchOptions = shuffled([...new Set([...q.pairs.map((x) => x.right), ...(q.distractors ?? [])])], `${seed}:${q.id}:m`);
    }
    return p;
  });
}

/** The right answer, written out, for showing after an attempt. */
export function correctAnswerText(q: Question): string {
  switch (q.type) {
    case "multiple_choice": case "true_false": return q.choices?.find((c) => c.correct)?.text ?? "";
    case "multiple_answers": return (q.choices ?? []).filter((c) => c.correct).map((c) => c.text).join("; ");
    case "short_answer": return (q.answers ?? []).join(" / ");
    case "fill_in_multiple_blanks": return (q.blanks ?? []).map((b) => `[${b.name}] ${b.answers.join(" / ")}`).join("; ");
    case "multiple_dropdowns": return (q.dropdowns ?? []).map((d) => `[${d.name}] ${d.choices.find((c) => c.correct)?.text ?? ""}`).join("; ");
    case "matching": return (q.pairs ?? []).map((p) => `${p.left} → ${p.right}`).join("; ");
    case "numerical": return (q.numeric ?? []).map((a) => (a.kind === "range" ? `${a.min} to ${a.max}` : a.margin ? `${a.value} ± ${a.margin}` : `${a.value}`)).join(" or ");
    default: return "";
  }
}

/** Cleans a learner's answers to the quiz's questions (unknown questions and odd shapes dropped). */
export function cleanAnswers(questions: Question[], raw: unknown): Answers {
  const given = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Answers = {};
  for (const q of questions) {
    const a = given[q.id];
    if (a === undefined || a === null) continue;
    if (q.type === "multiple_answers") {
      if (Array.isArray(a)) out[q.id] = a.filter((x): x is string => typeof x === "string").slice(0, LIMITS.choices).map((x) => x.slice(0, 64));
    } else if (q.type === "fill_in_multiple_blanks" || q.type === "multiple_dropdowns" || q.type === "matching") {
      if (typeof a === "object" && !Array.isArray(a)) {
        const m: Record<string, string> = {};
        for (const [k, v] of Object.entries(a as Record<string, unknown>).slice(0, LIMITS.choices)) if (typeof v === "string") m[k.slice(0, 64)] = v.slice(0, LIMITS.option);
        out[q.id] = m;
      }
    } else if (typeof a === "string") {
      out[q.id] = a.slice(0, q.type === "essay" ? 20_000 : LIMITS.option);
    } else if (typeof a === "number" && q.type === "numerical") {
      out[q.id] = String(a);
    }
  }
  return out;
}

// ── Results a learner may see ──────────────────────────────────────────────
export type ResultQuestion = PublicQuestion & {
  answer: Answer | null;
  earned: number;
  status: QuestionResult["status"];
  correctAnswer?: string;
  feedback?: string;
};
export type AttemptView = { score: number | null; maxScore: number; pending: boolean; questions: ResultQuestion[] | null; correctShown: boolean };

/**
 * One finished attempt, as its learner may see it: always the score; which
 * questions were right only when the quiz shows results; the right answers
 * only when the quiz allows (after each attempt, or once no attempts are left).
 */
export function attemptView(quiz: Quiz, seed: string, answers: Answers, score: number | null, pending: boolean,
  manual: Record<string, number>, noAttemptsLeft: boolean): AttemptView {
  const s = scoreAttempt(quiz.questions, answers, manual);
  const max = s.max;
  if (!quiz.settings.showResults) return { score, maxScore: max, pending, questions: null, correctShown: false };
  const show = quiz.settings.showCorrectAnswers === "after_each_attempt" || (quiz.settings.showCorrectAnswers === "after_last_attempt" && noAttemptsLeft);
  const byId = new Map(quiz.questions.map((q) => [q.id, q]));
  const questions = publicQuestions(quiz, seed).map((p): ResultQuestion => {
    const q = byId.get(p.id)!;
    const r = s.results[p.id];
    const fb = q.feedback;
    const feedback = [fb?.general, r.status === "correct" ? fb?.correct : r.status === "incorrect" || r.status === "partial" ? fb?.incorrect : undefined].filter(Boolean).join("\n\n");
    return { ...p, answer: answers[p.id] ?? null, earned: r.earned, status: r.status,
      ...(show && q.type !== "essay" && q.type !== "text_only" ? { correctAnswer: correctAnswerText(q) } : {}),
      ...(feedback ? { feedback } : {}) };
  });
  return { score, maxScore: max, pending, questions, correctShown: show };
}
