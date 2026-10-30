import {
  attemptView, checkQuiz, cleanAnswers, correctAnswerText, keptScore, publicQuestions, scoreAttempt, scoreQuestion,
  type Question, type Quiz,
} from "@/lib/quiz/quiz";
import { learnerView } from "@/lib/quiz/learner-view";
import type { Attempt, StoredQuiz } from "@/lib/quiz/quiz-store";

const mc: Question = { id: "q1", type: "multiple_choice", text: "LLM stands for?", points: 2,
  choices: [{ id: "a", text: "Large Language Model", correct: true }, { id: "b", text: "Long Learning Machine", correct: false }],
  feedback: { correct: "Yes!", incorrect: "Review the reading.", general: "LLMs are…" } };
const ma: Question = { id: "q2", type: "multiple_answers", text: "Pick the AI labs", points: 4,
  choices: [{ id: "a", text: "OpenAI", correct: true }, { id: "b", text: "Anthropic", correct: true }, { id: "c", text: "IKEA", correct: false }, { id: "d", text: "Lego", correct: false }] };
const blanks: Question = { id: "q3", type: "fill_in_multiple_blanks", text: "Roses are [c1], violets are [c2].", points: 2,
  blanks: [{ name: "c1", answers: ["red"] }, { name: "c2", answers: ["blue", "violet"] }] };
const drops: Question = { id: "q4", type: "multiple_dropdowns", text: "Paris is in [country].", points: 1,
  dropdowns: [{ name: "country", choices: [{ id: "fr", text: "France", correct: true }, { id: "de", text: "Germany", correct: false }] }] };
const match: Question = { id: "q5", type: "matching", text: "Match", points: 3,
  pairs: [{ id: "p1", left: "GPT", right: "OpenAI" }, { id: "p2", left: "Claude", right: "Anthropic" }, { id: "p3", left: "Gemini", right: "Google" }], distractors: ["IKEA"] };
const numeric: Question = { id: "q6", type: "numerical", text: "Pi?", points: 1, numeric: [{ kind: "exact", value: 3.14, margin: 0.01 }, { kind: "range", min: 10, max: 20 }] };
const short: Question = { id: "q7", type: "short_answer", text: "Capital of France?", points: 1, answers: ["Paris"] };
const essay: Question = { id: "q8", type: "essay", text: "Explain.", points: 5 };
const info: Question = { id: "q9", type: "text_only", text: "Read this first.", points: 0 };

const quiz = (questions: Question[], settings: Partial<Quiz["settings"]> = {}): Quiz => {
  const c = checkQuiz({ settings, questions });
  if (!c.ok) throw new Error(c.error);
  return c.quiz;
};

describe("scoring, as Canvas does", () => {
  it("multiple choice and short answers", () => {
    expect(scoreQuestion(mc, "a")).toEqual({ earned: 2, status: "correct" });
    expect(scoreQuestion(mc, "b")).toEqual({ earned: 0, status: "incorrect" });
    expect(scoreQuestion(mc, undefined).status).toBe("unanswered");
    expect(scoreQuestion(short, "  paris ").status).toBe("correct");
  });
  it("gives partial credit for multiple answers, minus wrong ticks, never below zero", () => {
    expect(scoreQuestion(ma, ["a", "b"]).earned).toBe(4);
    expect(scoreQuestion(ma, ["a"])).toEqual({ earned: 2, status: "partial" });
    expect(scoreQuestion(ma, ["a", "c"]).earned).toBe(0);           // 4 × (½ right − ½ wrong)
    expect(scoreQuestion(ma, ["a", "b", "c"]).earned).toBe(2);       // 4 × (1 − ½)
    expect(scoreQuestion(ma, ["c", "d"]).earned).toBe(0);
  });
  it("gives partial credit per blank, dropdown and pair", () => {
    expect(scoreQuestion(blanks, { c1: "Red", c2: "violet" }).status).toBe("correct");
    expect(scoreQuestion(blanks, { c1: "red", c2: "green" })).toEqual({ earned: 1, status: "partial" });
    expect(scoreQuestion(drops, { country: "fr" }).earned).toBe(1);
    expect(scoreQuestion(match, { p1: "OpenAI", p2: "Anthropic", p3: "IKEA" })).toEqual({ earned: 2, status: "partial" });
  });
  it("numbers: exact with a margin, or in a range", () => {
    expect(scoreQuestion(numeric, "3.145").status).toBe("correct");
    expect(scoreQuestion(numeric, "15").status).toBe("correct");
    expect(scoreQuestion(numeric, "3.2").status).toBe("incorrect");
    expect(scoreQuestion(numeric, "abc").status).toBe("incorrect");
  });
  it("leaves essays to the tutor, then counts their points", () => {
    const qs = [mc, essay, info];
    const before = scoreAttempt(qs, { q1: "a", q8: "My essay" });
    expect(before).toMatchObject({ score: 2, max: 7, pending: true });
    const after = scoreAttempt(qs, { q1: "a", q8: "My essay" }, { q8: 4 });
    expect(after).toMatchObject({ score: 6, pending: false });
    expect(scoreAttempt(qs, { q1: "a" }).pending).toBe(false);   // an unanswered essay has nothing to grade
  });
  it("keeps the highest, latest or average score", () => {
    expect(keptScore("keep_highest", [3, 8, 5])).toBe(8);
    expect(keptScore("keep_latest", [3, 8, 5])).toBe(5);
    expect(keptScore("keep_average", [3, 8, 5])).toBe(5.33);
    expect(keptScore("keep_highest", [])).toBeNull();
  });
});

describe("checking a quiz", () => {
  it("accepts every main type and totals the points", () => {
    const c = checkQuiz({ settings: { allowedAttempts: 2, timeLimitMin: "30" }, questions: [mc, ma, blanks, drops, match, numeric, short, essay, info] });
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.points).toBe(19);
      expect(c.quiz.settings).toMatchObject({ allowedAttempts: 2, timeLimitMin: 30, scoringPolicy: "keep_highest" });
    }
  });
  it("says what's wrong", () => {
    expect(checkQuiz({ questions: [] })).toMatchObject({ ok: false, error: "Add at least one question." });
    expect(checkQuiz({ questions: [{ ...mc, choices: mc.choices!.map((c) => ({ ...c, correct: true })) }] })).toMatchObject({ ok: false });
    expect(checkQuiz({ questions: [{ ...blanks, text: "No blanks here" }] })).toMatchObject({ ok: false });
    expect(checkQuiz({ questions: [{ ...short, answers: [] }] })).toMatchObject({ ok: false });
    expect(checkQuiz({ questions: [{ ...mc, type: "formula" }] })).toMatchObject({ ok: false, error: "Question 1 has an unknown type." });
    expect(checkQuiz({ questions: [{ ...mc, points: 5000 }] })).toMatchObject({ ok: false });
  });
  it("fills in True/False choices", () => {
    const c = checkQuiz({ questions: [{ id: "t", type: "true_false", text: "Sky is blue", points: 1, correct: true }] });
    expect(c.ok && c.quiz.questions[0].choices!.map((x) => [x.id, x.correct])).toEqual([["true", true], ["false", false]]);
  });
  it("cleans learner answers to the right shapes", () => {
    expect(cleanAnswers([mc, ma, blanks, numeric], { q1: "a", q2: "oops", q3: { c1: "red", c2: 7 }, q6: 3.14, extra: "x" }))
      .toEqual({ q1: "a", q3: { c1: "red" }, q6: "3.14" });
  });
});

describe("what learners see", () => {
  const q = quiz([mc, ma, match, info], { shuffleAnswers: true });
  it("never includes the answers", () => {
    const text = JSON.stringify(publicQuestions(q, "seed1"));
    expect(text).not.toContain("correct");
    expect(text).not.toMatch(/"right"/);
    expect(text).not.toContain("feedback");
  });
  it("shuffles the same way for the same attempt, and keeps every option", () => {
    const a = publicQuestions(q, "s1"), b = publicQuestions(q, "s1");
    expect(a).toEqual(b);
    expect(a[2].matchOptions!.sort()).toEqual(["Anthropic", "Google", "IKEA", "OpenAI"]);
  });
  it("shows correct answers only when the quiz allows", () => {
    const answers = { q1: "b", q2: ["a"] };
    const afterLast = quiz([mc, ma], { showCorrectAnswers: "after_last_attempt" });
    expect(attemptView(afterLast, "s", answers, 1, false, {}, false).questions![0].correctAnswer).toBeUndefined();
    expect(attemptView(afterLast, "s", answers, 1, false, {}, true).questions![0].correctAnswer).toBe("Large Language Model");
    const hidden = quiz([mc], { showResults: false });
    expect(attemptView(hidden, "s", answers, 0, false, {}, true).questions).toBeNull();
    const view = attemptView(quiz([mc], { showCorrectAnswers: "after_each_attempt" }), "s", { q1: "b" }, 0, false, {}, false);
    expect(view.questions![0]).toMatchObject({ status: "incorrect", correctAnswer: "Large Language Model", feedback: "LLMs are…\n\nReview the reading." });
  });
  it("writes out the key for tutors", () => {
    expect(correctAnswerText(match)).toBe("GPT → OpenAI; Claude → Anthropic; Gemini → Google");
    expect(correctAnswerText(numeric)).toBe("3.14 ± 0.01 or 10 to 20");
  });
});

describe("the learner's quiz panel", () => {
  const stored: StoredQuiz = { lessonId: "l1", courseSlug: "c", points: 6, updatedAt: "", quiz: quiz([mc, ma], { allowedAttempts: 2, dueDate: "2026-05-24" }) };
  const attempt = (n: number, extra: Partial<Attempt>): Attempt => ({
    id: n, userId: 1, lessonId: "l1", courseSlug: "c", attempt: n, seed: `s${n}`, quiz: stored.quiz, answers: {},
    startedAt: "2026-05-20T10:00:00Z", deadline: null, submittedAt: null, score: null, maxScore: 6, pending: false, manual: {}, tutorComment: null, gradedAt: null, ...extra,
  });
  it("counts attempts, keeps the best score and marks late work", () => {
    const v = learnerView(stored, [attempt(1, { submittedAt: "2026-05-23T10:00:00Z", score: 2 }), attempt(2, { submittedAt: "2026-05-25T10:00:00Z", score: 6 })]);
    expect(v).toMatchObject({ kept: 6, attemptsLeft: 0, canStart: false, inProgress: null });
    expect(v.attempts.map((a) => a.late)).toEqual([false, true]);
    expect(v.result?.number).toBe(2);
    expect(v.result?.correctShown).toBe(true);   // no attempts left
  });
  it("gives the attempt in progress without answers", () => {
    const v = learnerView(stored, [attempt(1, { answers: { q1: "a" } })]);
    expect(v.canStart).toBe(false);
    expect(v.inProgress).toMatchObject({ attemptId: 1, answers: { q1: "a" } });
    expect(JSON.stringify(v.inProgress)).not.toContain("correct");
  });
});

describe("importing a course with quizzes", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildCourseFromImport, COURSE_EXPORT_FORMAT } = require("@/lib/courses/course-export");
  const payload = (quizValue: unknown) => ({
    format: COURSE_EXPORT_FORMAT, exportedAt: "2026-10-30T00:00:00Z", sourcePlatform: "Requisor Learning",
    course: { title: "Imported", tagline: "t", category: "imported", level: "Beginner", tags: [] },
    lessons: [{ title: "M1: Quiz", description: "Quiz", youtubeId: "", durationMin: 15, resources: [], keyTakeaways: [], format: "reading", rubric: [], quiz: quizValue }],
  });
  it("keeps each lesson's quiz, checked like any quiz", () => {
    const r = buildCourseFromImport(payload({ settings: { allowedAttempts: 2 }, questions: [mc, ma] }));
    expect(r.ok).toBe(true);
    const [entry] = Object.values(r.quizByLessonId) as { points: number; quiz: Quiz }[];
    expect(entry.points).toBe(6);
    expect(entry.quiz.settings.allowedAttempts).toBe(2);
  });
  it("refuses a broken quiz", () => {
    expect(buildCourseFromImport(payload({ questions: [] }))).toMatchObject({ ok: false, error: "Lesson 1's quiz: Add at least one question." });
  });
});
