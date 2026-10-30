/**
 * Graded quizzes in the database.
 *
 *   lesson_quizzes  one quiz per lesson (the lesson's assessment, step 3 of the
 *                   wizard), keyed by lesson id like the rubric, because course
 *                   saves replace lesson rows wholesale. Holds the answers:
 *                   only ever read on the server.
 *   quiz_attempts   each learner attempt, with a copy of the quiz as it was when
 *                   started (so later edits don't change a grade), its answers
 *                   (saved as they go), the deadline for timed quizzes, the score,
 *                   and the tutor's points for essays.
 *
 * Tables are created on first use and also listed in scripts/migrate.js.
 */
import { randomBytes } from "node:crypto";
import { db } from "@/lib/server/db";
import { checkQuiz, cleanAnswers, keptScore, scoreAttempt, type Answers, type Quiz } from "@/lib/quiz/quiz";

/** A timed quiz still accepts the answers sent this long after its deadline (network delay). */
export const DEADLINE_GRACE_MS = 30_000;

let schemaPromise: Promise<void> | undefined;
export function ensureQuizTables(): Promise<void> {
  schemaPromise ??= db.query(`
    CREATE TABLE IF NOT EXISTS lesson_quizzes (
      lesson_id TEXT PRIMARY KEY,
      course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
      quiz JSONB NOT NULL,
      points REAL NOT NULL,
      updated_by INT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS lesson_quizzes_course_idx ON lesson_quizzes (course_slug);
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL,
      course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
      attempt INT NOT NULL,
      seed TEXT NOT NULL,
      quiz JSONB NOT NULL,
      answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deadline TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      score REAL,
      max_score REAL NOT NULL,
      pending BOOLEAN NOT NULL DEFAULT FALSE,
      manual JSONB NOT NULL DEFAULT '{}'::jsonb,
      tutor_comment TEXT,
      graded_by INT REFERENCES users(id) ON DELETE SET NULL,
      graded_at TIMESTAMPTZ,
      UNIQUE (user_id, lesson_id, attempt)
    );
    CREATE INDEX IF NOT EXISTS quiz_attempts_lesson_idx ON quiz_attempts (lesson_id, submitted_at DESC);
    CREATE INDEX IF NOT EXISTS quiz_attempts_user_idx ON quiz_attempts (user_id, lesson_id);
  `).then(() => undefined).catch((error) => { schemaPromise = undefined; throw error; });
  return schemaPromise;
}

// ── Quizzes ────────────────────────────────────────────────────────────────
export type StoredQuiz = { lessonId: string; courseSlug: string; quiz: Quiz; points: number; updatedAt: string };

export async function getQuiz(lessonId: string): Promise<StoredQuiz | null> {
  await ensureQuizTables();
  const { rows } = await db.query<{ lesson_id: string; course_slug: string; quiz: unknown; points: number; updated_at: Date }>(
    "SELECT lesson_id, course_slug, quiz, points, updated_at FROM lesson_quizzes WHERE lesson_id=$1", [lessonId]);
  const row = rows[0];
  if (!row) return null;
  const checked = checkQuiz(row.quiz);
  if (!checked.ok) return null;
  return { lessonId: row.lesson_id, courseSlug: row.course_slug, quiz: checked.quiz, points: checked.points, updatedAt: row.updated_at.toISOString() };
}

export async function saveQuiz(lessonId: string, courseSlug: string, quiz: Quiz, points: number, userId: number): Promise<void> {
  await ensureQuizTables();
  await db.query(
    `INSERT INTO lesson_quizzes (lesson_id, course_slug, quiz, points, updated_by, updated_at) VALUES ($1,$2,$3::jsonb,$4,$5,NOW())
     ON CONFLICT (lesson_id) DO UPDATE SET course_slug=EXCLUDED.course_slug, quiz=EXCLUDED.quiz, points=EXCLUDED.points,
       updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
    [lessonId, courseSlug, JSON.stringify(quiz), points, userId]);
}

export async function deleteQuiz(lessonId: string): Promise<void> {
  await ensureQuizTables();
  await db.query("DELETE FROM lesson_quizzes WHERE lesson_id=$1", [lessonId]);
}

// ── Attempts ───────────────────────────────────────────────────────────────
type AttemptRow = {
  id: number; user_id: number; lesson_id: string; course_slug: string; attempt: number; seed: string; quiz: Quiz;
  answers: Answers; started_at: Date; deadline: Date | null; submitted_at: Date | null; score: number | null;
  max_score: number; pending: boolean; manual: Record<string, number>; tutor_comment: string | null; graded_at: Date | null;
};
export type Attempt = {
  id: number; userId: number; lessonId: string; courseSlug: string; attempt: number; seed: string; quiz: Quiz;
  answers: Answers; startedAt: string; deadline: string | null; submittedAt: string | null; score: number | null;
  maxScore: number; pending: boolean; manual: Record<string, number>; tutorComment: string | null; gradedAt: string | null;
};
const toAttempt = (r: AttemptRow): Attempt => ({
  id: r.id, userId: r.user_id, lessonId: r.lesson_id, courseSlug: r.course_slug, attempt: r.attempt, seed: r.seed, quiz: r.quiz,
  answers: r.answers ?? {}, startedAt: r.started_at.toISOString(), deadline: r.deadline?.toISOString() ?? null,
  submittedAt: r.submitted_at?.toISOString() ?? null, score: r.score, maxScore: r.max_score, pending: r.pending,
  manual: r.manual ?? {}, tutorComment: r.tutor_comment, gradedAt: r.graded_at?.toISOString() ?? null,
});
const ATTEMPT_COLUMNS = "id, user_id, lesson_id, course_slug, attempt, seed, quiz, answers, started_at, deadline, submitted_at, score, max_score, pending, manual, tutor_comment, graded_at";

/** Scores and closes attempts whose time ran out, with the answers saved so far. */
async function closeExpired(userId: number, lessonId: string): Promise<void> {
  const { rows } = await db.query<AttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts
      WHERE user_id=$1 AND lesson_id=$2 AND submitted_at IS NULL AND deadline IS NOT NULL AND deadline + interval '30 seconds' < NOW()`,
    [userId, lessonId]);
  for (const r of rows) {
    const s = scoreAttempt(r.quiz.questions, r.answers ?? {});
    await db.query("UPDATE quiz_attempts SET submitted_at=deadline, score=$2, pending=$3 WHERE id=$1 AND submitted_at IS NULL", [r.id, s.score, s.pending]);
  }
}

export async function attemptsFor(userId: number, lessonId: string): Promise<Attempt[]> {
  await ensureQuizTables();
  await closeExpired(userId, lessonId);
  const { rows } = await db.query<AttemptRow>(
    `SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts WHERE user_id=$1 AND lesson_id=$2 ORDER BY attempt`, [userId, lessonId]);
  return rows.map(toAttempt);
}

export type StartResult = { ok: true; attempt: Attempt } | { ok: false; error: string; status: number };

/** Starts an attempt, or returns the one already in progress. Checks the attempt limit. */
export async function startAttempt(userId: number, stored: StoredQuiz): Promise<StartResult> {
  await ensureQuizTables();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // One start at a time per learner and quiz, so a double click can't use two attempts.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`quiz:${userId}:${stored.lessonId}`]);
    await closeExpired(userId, stored.lessonId);
    const { rows } = await client.query<AttemptRow>(
      `SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts WHERE user_id=$1 AND lesson_id=$2 ORDER BY attempt`, [userId, stored.lessonId]);
    const open = rows.find((r) => !r.submitted_at);
    if (open) { await client.query("COMMIT"); return { ok: true, attempt: toAttempt(open) }; }
    const limit = stored.quiz.settings.allowedAttempts;
    if (limit !== null && rows.length >= limit) {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, error: limit === 1 ? "You've already taken this quiz." : `You've used all ${limit} attempts.` };
    }
    const minutes = stored.quiz.settings.timeLimitMin;
    const { rows: created } = await client.query<AttemptRow>(
      `INSERT INTO quiz_attempts (user_id, lesson_id, course_slug, attempt, seed, quiz, max_score, deadline)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7, CASE WHEN $8::int IS NULL THEN NULL ELSE NOW() + make_interval(mins => $8::int) END)
       RETURNING ${ATTEMPT_COLUMNS}`,
      [userId, stored.lessonId, stored.courseSlug, rows.length + 1, randomBytes(8).toString("hex"), JSON.stringify(stored.quiz), stored.points, minutes]);
    await client.query("COMMIT");
    return { ok: true, attempt: toAttempt(created[0]) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function openAttempt(attemptId: number, userId: number): Promise<AttemptRow | null> {
  const { rows } = await db.query<AttemptRow>(`SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts WHERE id=$1 AND user_id=$2`, [attemptId, userId]);
  return rows[0] ?? null;
}
const inTime = (r: AttemptRow) => !r.deadline || r.deadline.getTime() + DEADLINE_GRACE_MS >= Date.now();

/** Saves answers as the learner goes (so a timed quiz that runs out keeps them). */
export async function saveAnswers(attemptId: number, userId: number, raw: unknown): Promise<"saved" | "closed" | "missing"> {
  await ensureQuizTables();
  const r = await openAttempt(attemptId, userId);
  if (!r) return "missing";
  if (r.submitted_at || !inTime(r)) return "closed";
  await db.query("UPDATE quiz_attempts SET answers=$2::jsonb WHERE id=$1 AND submitted_at IS NULL", [attemptId, JSON.stringify(cleanAnswers(r.quiz.questions, raw))]);
  return "saved";
}

/** Hands an attempt in and scores it. Past the deadline, the answers saved in time count. */
export async function submitAttempt(attemptId: number, userId: number, raw: unknown): Promise<Attempt | null> {
  await ensureQuizTables();
  const r = await openAttempt(attemptId, userId);
  if (!r) return null;
  if (r.submitted_at) return toAttempt(r);
  const late = !inTime(r);
  const answers = late ? r.answers ?? {} : cleanAnswers(r.quiz.questions, raw);
  const s = scoreAttempt(r.quiz.questions, answers);
  const { rows } = await db.query<AttemptRow>(
    `UPDATE quiz_attempts SET answers=$2::jsonb, submitted_at=${late ? "deadline" : "NOW()"}, score=$3, pending=$4
      WHERE id=$1 AND submitted_at IS NULL RETURNING ${ATTEMPT_COLUMNS}`,
    [attemptId, JSON.stringify(answers), s.score, s.pending]);
  return rows[0] ? toAttempt(rows[0]) : toAttempt((await openAttempt(attemptId, userId))!);
}

/** The score that counts for a learner, under the quiz's policy (null while nothing is fully marked). */
export function keptFor(attempts: Attempt[], policy: Quiz["settings"]["scoringPolicy"]): number | null {
  return keptScore(policy, attempts.filter((a) => a.submittedAt && !a.pending && a.score !== null).map((a) => a.score as number));
}

// ── Tutors ─────────────────────────────────────────────────────────────────
export type TutorAttemptRow = {
  id: number; lessonId: string; lessonTitle: string; courseTitle: string; studentName: string; studentEmail: string;
  attempt: number; submittedAt: string; score: number | null; maxScore: number; pending: boolean; gradedAt: string | null;
  dueDate: string | null;
};

/** Submitted attempts on quizzes in courses the person owns or manages. */
export async function tutorAttempts(userId: number, reachAll: boolean, universityId: number | null, lessonId?: string): Promise<TutorAttemptRow[]> {
  await ensureQuizTables();
  const { rows } = await db.query<{
    id: number; lesson_id: string; lesson_title: string | null; course_title: string; name: string | null; email: string;
    attempt: number; submitted_at: Date; score: number | null; max_score: number; pending: boolean; graded_at: Date | null; due: string | null;
  }>(
    `SELECT a.id, a.lesson_id, l.title AS lesson_title, c.title AS course_title, u.name, u.email, a.attempt,
            a.submitted_at, a.score, a.max_score, a.pending, a.graded_at, a.quiz->'settings'->>'dueDate' AS due
       FROM quiz_attempts a
       JOIN users u ON u.id = a.user_id
       JOIN courses c ON c.slug = a.course_slug
       LEFT JOIN course_lessons l ON l.id = a.lesson_id
      WHERE a.submitted_at IS NOT NULL
        AND ($1::boolean OR (c.university_id IS NOT NULL AND c.university_id = $3::int) OR c.owner_user_id = $2)
        AND ($4::text IS NULL OR a.lesson_id = $4)
      ORDER BY a.submitted_at DESC LIMIT 300`,
    [reachAll, userId, universityId, lessonId ?? null]);
  return rows.map((r) => ({
    id: r.id, lessonId: r.lesson_id, lessonTitle: r.lesson_title ?? "Deleted lesson", courseTitle: r.course_title,
    studentName: r.name ?? r.email.split("@")[0], studentEmail: r.email, attempt: r.attempt, submittedAt: r.submitted_at.toISOString(),
    score: r.score, maxScore: r.max_score, pending: r.pending, gradedAt: r.graded_at?.toISOString() ?? null, dueDate: r.due,
  }));
}

/** One submitted attempt, for a tutor who owns or manages its course. */
export async function tutorAttempt(attemptId: number, userId: number, reachAll: boolean, universityId: number | null): Promise<(Attempt & { studentName: string; lessonTitle: string }) | null> {
  await ensureQuizTables();
  const { rows } = await db.query<AttemptRow & { name: string | null; email: string; lesson_title: string | null }>(
    `SELECT ${ATTEMPT_COLUMNS.split(", ").map((c) => `a.${c}`).join(", ")}, u.name, u.email, l.title AS lesson_title
       FROM quiz_attempts a JOIN users u ON u.id = a.user_id JOIN courses c ON c.slug = a.course_slug
       LEFT JOIN course_lessons l ON l.id = a.lesson_id
      WHERE a.id=$1 AND a.submitted_at IS NOT NULL
        AND ($2::boolean OR (c.university_id IS NOT NULL AND c.university_id = $4::int) OR c.owner_user_id = $3)`,
    [attemptId, reachAll, userId, universityId]);
  const r = rows[0];
  return r ? { ...toAttempt(r), studentName: r.name ?? r.email.split("@")[0], lessonTitle: r.lesson_title ?? "Deleted lesson" } : null;
}

/** A tutor's points for essay answers (and an optional comment); rescored. */
export async function gradeAttempt(attempt: Attempt, rawManual: unknown, comment: unknown, graderId: number): Promise<Attempt> {
  const essays = attempt.quiz.questions.filter((q) => q.type === "essay");
  const given = (rawManual && typeof rawManual === "object" ? rawManual : {}) as Record<string, unknown>;
  const manual: Record<string, number> = { ...attempt.manual };
  for (const q of essays) {
    const v = typeof given[q.id] === "number" ? (given[q.id] as number) : typeof given[q.id] === "string" && given[q.id] !== "" ? Number(given[q.id]) : NaN;
    if (Number.isFinite(v)) manual[q.id] = Math.min(q.points, Math.max(0, Math.round(v * 100) / 100));
  }
  const s = scoreAttempt(attempt.quiz.questions, attempt.answers, manual);
  const text = typeof comment === "string" ? comment.trim().slice(0, 5000) : attempt.tutorComment ?? "";
  const { rows } = await db.query<AttemptRow>(
    `UPDATE quiz_attempts SET manual=$2::jsonb, score=$3, pending=$4, tutor_comment=$5, graded_by=$6, graded_at=NOW()
      WHERE id=$1 RETURNING ${ATTEMPT_COLUMNS}`,
    [attempt.id, JSON.stringify(manual), s.score, s.pending, text || null, graderId]);
  return toAttempt(rows[0]);
}
