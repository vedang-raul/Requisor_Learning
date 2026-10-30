export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { keptScore, type Quiz } from "@/lib/quiz/quiz";
import { ensureQuizTables } from "@/lib/quiz/quiz-store";

/**
 * Graded assignments the learner still has to hand in: lessons that need a
 * file, which they have started (opened) or completed, with nothing handed
 * in yet. An assignment joins this list as the learner reaches its lesson,
 * so a course's later lessons don't crowd it before they get there.
 */
const DUE_SQL = `
  SELECT l.id AS lesson_id, l.title AS lesson_title, l.course_slug, c.title AS course_title,
         to_char(l.assignment_due_date, 'YYYY-MM-DD') AS due_date, l.assignment_marks,
         EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.user_id = $1 AND lc.lesson_id = l.id) AS completed
    FROM course_lessons l
    JOIN courses c ON c.slug = l.course_slug
   WHERE l.requires_submission AND l.published AND c.published
     AND (l.publish_at IS NULL OR l.publish_at <= NOW())
     AND (EXISTS (SELECT 1 FROM lesson_views v WHERE v.user_id = $1 AND v.lesson_id = l.id)
          OR EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.user_id = $1 AND lc.lesson_id = l.id))
     AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.user_id = $1 AND s.lesson_id = l.id)
   ORDER BY l.assignment_due_date ASC NULLS LAST, c.title, l.position
   LIMIT 100`;

/** Graded quizzes the learner has reached (started or completed the lesson) and not taken yet. */
const QUIZ_DUE_SQL = `
  SELECT l.id AS lesson_id, l.title AS lesson_title, l.course_slug, c.title AS course_title,
         q.quiz->'settings'->>'dueDate' AS due_date, q.points,
         EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.user_id = $1 AND lc.lesson_id = l.id) AS completed
    FROM lesson_quizzes q
    JOIN course_lessons l ON l.id = q.lesson_id
    JOIN courses c ON c.slug = l.course_slug
   WHERE l.published AND c.published AND (l.publish_at IS NULL OR l.publish_at <= NOW())
     AND (EXISTS (SELECT 1 FROM lesson_views v WHERE v.user_id = $1 AND v.lesson_id = l.id)
          OR EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.user_id = $1 AND lc.lesson_id = l.id))
     AND NOT EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.user_id = $1 AND a.lesson_id = l.id AND a.submitted_at IS NOT NULL)
   ORDER BY due_date ASC NULLS LAST, c.title, l.position
   LIMIT 100`;

/** The learner's quiz results, one per quiz: the score that counts under the quiz's policy. */
async function quizResults(userId: number) {
  const { rows } = await db.query<{
    lesson_id: string; lesson_title: string | null; course_slug: string; course_title: string; quiz: Quiz;
    attempt: number; submitted_at: Date; score: number | null; max_score: number; pending: boolean;
  }>(
    `SELECT a.lesson_id, l.title AS lesson_title, a.course_slug, c.title AS course_title, a.quiz, a.attempt,
            a.submitted_at, a.score, a.max_score, a.pending
       FROM quiz_attempts a JOIN courses c ON c.slug = a.course_slug LEFT JOIN course_lessons l ON l.id = a.lesson_id
      WHERE a.user_id = $1 AND a.submitted_at IS NOT NULL
      ORDER BY a.lesson_id, a.attempt`, [userId]);
  const byLesson = new Map<string, typeof rows>();
  for (const r of rows) byLesson.set(r.lesson_id, [...(byLesson.get(r.lesson_id) ?? []), r]);
  return [...byLesson.values()].map((list) => {
    const last = list[list.length - 1];
    const settings = last.quiz.settings;
    return {
      lessonId: last.lesson_id, lessonTitle: last.lesson_title ?? "Deleted lesson", lessonExists: last.lesson_title !== null,
      courseSlug: last.course_slug, courseTitle: last.course_title, attempts: list.length,
      kept: keptScore(settings.scoringPolicy, list.filter((r) => !r.pending && r.score !== null).map((r) => r.score as number)),
      maxScore: last.max_score, pending: list.some((r) => r.pending), lastSubmittedAt: last.submitted_at.toISOString(),
      dueDate: settings.dueDate,
      late: Boolean(settings.dueDate && list[0].submitted_at.toISOString().slice(0, 10) > settings.dueDate),
    };
  }).sort((a, b) => b.lastSubmittedAt.localeCompare(a.lastSubmittedAt));
}

/** Every assignment a learner has submitted, across all their courses —
 *  with grading status, for the "Submissions" sidebar page — and what they
 *  still have to hand in. Own data only: scoped to the signed-in user, no
 *  ownership check needed like the tutor-facing submission routes.
 *  ?count=due returns just how many are still to hand in (the sidebar badge). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { rows: userRows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  const { rows: dueRows } = await db.query<{
    lesson_id: string; lesson_title: string; course_slug: string; course_title: string;
    due_date: string | null; assignment_marks: number | null; completed: boolean;
  }>(DUE_SQL, [user.id]);
  await ensureQuizTables();
  const { rows: quizDueRows } = await db.query<{
    lesson_id: string; lesson_title: string; course_slug: string; course_title: string;
    due_date: string | null; points: number; completed: boolean;
  }>(QUIZ_DUE_SQL, [user.id]);
  if (new URL(req.url).searchParams.get("count") === "due") {
    return Response.json({ due: dueRows.length + quizDueRows.length }, { headers: { "Cache-Control": "no-store" } });
  }

  const { rows } = await db.query<{
    id: number; lesson_id: string; lesson_title: string | null; lesson_exists: boolean;
    course_slug: string; course_title: string;
    file_name: string; file_size: number; submitted_at: string;
    marks: number | null; raw_score: number | null; raw_max: number | null; graded_at: string | null; remark: string | null;
    assignment_due_date: string | null; assignment_marks: number | null;
  }>(
    `SELECT s.id, s.lesson_id, l.title AS lesson_title, (l.id IS NOT NULL) AS lesson_exists,
            s.course_slug, c.title AS course_title,
            s.file_name, s.file_size, s.submitted_at, g.marks, g.raw_score, g.raw_max, g.graded_at, g.remark,
            to_char(l.assignment_due_date, 'YYYY-MM-DD') AS assignment_due_date, l.assignment_marks
     FROM assignment_submissions s
     JOIN courses c ON c.slug = s.course_slug
     LEFT JOIN course_lessons l ON l.id = s.lesson_id
     LEFT JOIN assignment_grades g ON g.submission_id = s.id
     WHERE s.user_id = $1
     ORDER BY s.submitted_at DESC`,
    [user.id]
  );

  return Response.json({
    submissions: rows.map((r) => ({
      id: r.id,
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title ?? "Deleted lesson",
      lessonExists: r.lesson_exists,
      courseSlug: r.course_slug,
      courseTitle: r.course_title,
      fileName: r.file_name,
      fileSize: r.file_size,
      submittedAt: r.submitted_at,
      checked: r.marks !== null,
      marks: r.marks,
      rawScore: r.raw_score,
      rawMax: r.raw_max,
      gradedAt: r.graded_at,
      remark: r.remark,
      dueDate: r.assignment_due_date,
      totalMarks: r.assignment_marks,
    })),
    due: [
      ...dueRows.map((r) => ({
        kind: "file" as const,
        lessonId: r.lesson_id,
        lessonTitle: r.lesson_title,
        courseSlug: r.course_slug,
        courseTitle: r.course_title,
        dueDate: r.due_date,
        totalMarks: r.assignment_marks,
        lessonCompleted: r.completed,
      })),
      ...quizDueRows.map((r) => ({
        kind: "quiz" as const,
        lessonId: r.lesson_id,
        lessonTitle: r.lesson_title,
        courseSlug: r.course_slug,
        courseTitle: r.course_title,
        dueDate: r.due_date,
        totalMarks: r.points,
        lessonCompleted: r.completed,
      })),
    ].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    quizzes: await quizResults(user.id),
  }, { headers: { "Cache-Control": "no-store" } });
}
