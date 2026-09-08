export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/** Everything the grading view needs about one submission in a single
 *  request: who submitted it, its file, its current mark, and the
 *  lesson-wide checked/average-marks stats shown in the page header. */
const canManage = (role: unknown) => role === "admin" || role === "tutor";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const submissionId = Number(new URL(req.url).searchParams.get("submissionId"));
  if (!Number.isSafeInteger(submissionId) || submissionId < 1) {
    return Response.json({ error: "A valid submissionId is required." }, { status: 400 });
  }

  const { rows } = await db.query<{
    id: number; student_name: string | null; student_email: string;
    file_name: string; mime_type: string; file_size: number; submitted_at: string;
    lesson_id: string; lesson_title: string | null; course_slug: string; course_title: string;
    marks: number | null; raw_score: number | null; raw_max: number | null; graded_at: string | null; remark: string | null;
    assignment_due_date: string | null; assignment_marks: number | null;
  }>(
    `SELECT s.id, u.name AS student_name, u.email AS student_email,
            s.file_name, s.mime_type, s.file_size, s.submitted_at,
            s.lesson_id, l.title AS lesson_title, s.course_slug, c.title AS course_title,
             g.marks, g.raw_score, g.raw_max, g.graded_at, g.remark,
             l.assignment_due_date, l.assignment_marks
     FROM assignment_submissions s
     JOIN users u ON u.id = s.user_id
     JOIN courses c ON c.slug = s.course_slug
     LEFT JOIN course_lessons l ON l.id = s.lesson_id
     LEFT JOIN assignment_grades g ON g.submission_id = s.id
     WHERE s.id = $1 AND ($2::boolean OR c.owner_user_id = $3)`,
    [submissionId, isAdmin, userId]
  );
  const submission = rows[0];
  if (!submission) return Response.json({ error: "Submission not found." }, { status: 404 });

  const { rows: statRows } = await db.query<{ total: string; checked: string; average_marks: number | null }>(
    `SELECT COUNT(*)::text AS total, COUNT(g.submission_id)::text AS checked, AVG(g.marks) AS average_marks
     FROM assignment_submissions s LEFT JOIN assignment_grades g ON g.submission_id = s.id
     WHERE s.lesson_id = $1`,
    [submission.lesson_id]
  );
  const stats = statRows[0];

  const { rows: criteriaRows } = await db.query<{ id: number; title: string; description: string | null; max_points: number }>(
    "SELECT id, title, description, max_points FROM assignment_rubric_criteria WHERE lesson_id = $1 ORDER BY position ASC, id ASC",
    [submission.lesson_id]
  );
  const { rows: scoreRows } = await db.query<{ criterion_id: number; score: number }>(
    "SELECT criterion_id, score FROM assignment_grade_scores WHERE submission_id = $1",
    [submissionId]
  );
  const scoreByCriterion = new Map(scoreRows.map((r) => [r.criterion_id, r.score]));

  return Response.json({
    submission: {
      id: submission.id,
      studentName: submission.student_name ?? submission.student_email.split("@")[0],
      studentEmail: submission.student_email,
      fileName: submission.file_name,
      mimeType: submission.mime_type,
      fileSize: submission.file_size,
      submittedAt: submission.submitted_at,
      lessonId: submission.lesson_id,
      lessonTitle: submission.lesson_title ?? "Untitled lesson",
      courseSlug: submission.course_slug,
      courseTitle: submission.course_title,
      dueDate: submission.assignment_due_date,
      totalMarks: submission.assignment_marks,
    },
    marks: submission.marks,
    rawScore: submission.raw_score,
    rawMax: submission.raw_max,
    gradedAt: submission.graded_at,
    remark: submission.remark,
    rubric: criteriaRows.map((c) => ({
      id: c.id, title: c.title, description: c.description, maxPoints: c.max_points,
      score: scoreByCriterion.get(c.id) ?? null,
    })),
    stats: {
      total: Number(stats?.total ?? 0),
      checked: Number(stats?.checked ?? 0),
      averageMarks: stats?.average_marks !== null && stats?.average_marks !== undefined
        ? Math.round(Number(stats.average_marks) * 10) / 10
        : null,
    },
  });
}
