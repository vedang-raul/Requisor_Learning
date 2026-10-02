export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toSubmissionSource } from "@/lib/submission-source";

/**
 * Lists learner submissions for one lesson so a tutor can review who has
 * turned in the assignment and when — a deliberate, narrow exception to this
 * app's usual aggregate-only tutor-facing data (see
 * .agents/memory/tutor-insights-privacy.md, which covers ratings/analytics
 * dashboards). Grading is inherently a 1:1 relationship — a tutor cannot
 * review a submission without knowing whose it is — so identity here is the
 * point of the feature, not a leak of it. It stays narrow: only the learner
 * who submitted to THIS lesson is named, only to the tutor who owns the
 * lesson's course (or an admin), and never rolled into any cross-course or
 * cross-learner aggregate.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const LESSON_ID_PATTERN = /^[a-z0-9-]{3,120}$/i;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const lessonId = new URL(req.url).searchParams.get("lessonId")?.trim();
  if (lessonId && !LESSON_ID_PATTERN.test(lessonId)) {
    return Response.json({ error: "A valid lessonId is required." }, { status: 400 });
  }

  if (!lessonId) {
    const { rows: submissions } = await db.query<{
      id: number; student_name: string | null; student_email: string;
      file_name: string; file_size: number; submitted_at: string;
      marks: number | null; graded_at: string | null;
      lesson_title: string | null; course_title: string; source: string;
    }>(
      `SELECT s.id, u.name AS student_name, u.email AS student_email,
              s.file_name, s.file_size, s.submitted_at, g.marks, g.graded_at,
              l.title AS lesson_title, c.title AS course_title, s.source
       FROM assignment_submissions s
       JOIN users u ON u.id = s.user_id
       JOIN courses c ON c.slug = s.course_slug
       LEFT JOIN course_lessons l ON l.id = s.lesson_id
       LEFT JOIN assignment_grades g ON g.submission_id = s.id
       WHERE ($1::boolean OR c.owner_user_id = $2)
       ORDER BY s.submitted_at DESC
       LIMIT 200`,
      [isAdmin, userId]
    );
    const graded = submissions.filter((submission) => submission.marks !== null);
    const averageMarks = graded.length
      ? Math.round((graded.reduce((sum, submission) => sum + (submission.marks as number), 0) / graded.length) * 10) / 10
      : null;
    return Response.json({
      submissions: submissions.map((submission) => ({
        id: submission.id,
        studentName: submission.student_name ?? submission.student_email.split("@")[0],
        studentEmail: submission.student_email,
        fileName: submission.file_name,
        fileSize: submission.file_size,
        submittedAt: submission.submitted_at,
        marks: submission.marks,
        gradedAt: submission.graded_at,
        lessonTitle: submission.lesson_title ?? "Untitled lesson",
        courseTitle: submission.course_title,
        source: toSubmissionSource(submission.source),
      })),
      stats: { total: submissions.length, checked: graded.length, averageMarks },
    });
  }

  const { rows: lessonRows } = await db.query<{ id: string; course_slug: string }>(
    `SELECT l.id, l.course_slug FROM course_lessons l
     JOIN courses c ON c.slug = l.course_slug
     WHERE l.id = $1 AND ($2::boolean OR c.owner_user_id = $3)`,
    [lessonId, isAdmin, userId]
  );
  const lesson = lessonRows[0];
  if (!lesson) return Response.json({ error: "Lesson not found." }, { status: 404 });

  const { rows: submissions } = await db.query<{
    id: number; student_name: string | null; student_email: string;
    file_name: string; file_size: number; submitted_at: string;
    marks: number | null; graded_at: string | null; source: string;
  }>(
    `SELECT s.id, u.name AS student_name, u.email AS student_email, s.file_name, s.file_size, s.submitted_at,
            g.marks, g.graded_at, s.source
     FROM assignment_submissions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN assignment_grades g ON g.submission_id = s.id
     WHERE s.lesson_id = $1
     ORDER BY s.submitted_at DESC`,
    [lesson.id]
  );

  const graded = submissions.filter((s) => s.marks !== null);
  const averageMarks = graded.length
    ? Math.round((graded.reduce((sum, s) => sum + (s.marks as number), 0) / graded.length) * 10) / 10
    : null;

  return Response.json({
    submissions: submissions.map((s) => ({
      id: s.id,
      studentName: s.student_name ?? s.student_email.split("@")[0],
      studentEmail: s.student_email,
      fileName: s.file_name,
      fileSize: s.file_size,
      submittedAt: s.submitted_at,
      marks: s.marks,
      gradedAt: s.graded_at,
      source: toSubmissionSource(s.source),
    })),
    stats: { total: submissions.length, checked: graded.length, averageMarks },
  });
}
