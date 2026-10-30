export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { newCourseUniversity } from "@/lib/server/course-scope";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { replaceCourse, validateCourse, CourseConflictError } from "@/lib/courses/course-catalog";
import { buildCourseFromImport } from "@/lib/courses/course-export";
import { saveQuiz } from "@/lib/quiz/quiz-store";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import type { Course } from "@/lib/types";

/**
 * Creates a brand-new course from a previously exported JSON package (see
 * /api/tutor/courses/export). Always a new course — never merged into an
 * existing one, unlike Canvas's import tool — owned by whoever imports it,
 * and always starts as an unpublished draft so it can be reviewed before
 * going live to learners.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await readJsonBody(req, MAX_IMPORT_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "Export file is too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "That doesn't look like a valid export file." }, { status: 400 });
    return Response.json({ error: "That doesn't look like a valid export file." }, { status: 400 });
  }

  const imported = buildCourseFromImport(raw);
  if (!imported.ok) return Response.json({ error: imported.error }, { status: 400 });
  const candidate = imported.course;
  const lessons = candidate.lessons;
  const rubricByLessonIndex = lessons.map((lesson) => imported.rubricByLessonId[lesson.id] ?? []);

  const validated = validateCourse(candidate);
  if (!validated.ok) return Response.json({ error: `Invalid export file: ${validated.error}` }, { status: 400 });

  try {
    await replaceCourse(validated.course as Course, userId, false, true, newCourseUniversity(session.user));
  } catch (error) {
    if (error instanceof CourseConflictError) {
      return Response.json({ error: "A course with that slug already exists — try importing again." }, { status: 409 });
    }
    console.error(JSON.stringify({ operation: "tutor.course.import", userId, error: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Couldn't import the course." }, { status: 500 });
  }

  let warning: string | undefined;
  if (rubricByLessonIndex.some((r) => r.length > 0)) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < rubricByLessonIndex.length; i++) {
        const rubric = rubricByLessonIndex[i];
        for (let j = 0; j < rubric.length; j++) {
          const rc = rubric[j];
          await client.query(
            "INSERT INTO assignment_rubric_criteria (lesson_id, title, description, max_points, position) VALUES ($1,$2,$3,$4,$5)",
            [lessons[i].id, rc.title, rc.description, rc.maxPoints, j]
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      // The course itself imported fine — a rubric-copy hiccup shouldn't
      // surface as a failed import; the tutor can rebuild the rubric manually.
      console.error(JSON.stringify({ operation: "tutor.course.import.rubric", slug: candidate.slug, error: error instanceof Error ? error.message : "unknown" }));
      warning = "The course imported, but its grading rubric could not be copied.";
    } finally {
      client.release();
    }
  }

  const quizzes = Object.entries(imported.quizByLessonId);
  if (quizzes.length) {
    try {
      for (const [lessonId, { quiz, points }] of quizzes) await saveQuiz(lessonId, candidate.slug, quiz, points, userId);
    } catch (error) {
      console.error(JSON.stringify({ operation: "tutor.course.import.quiz", slug: candidate.slug, error: error instanceof Error ? error.message : "unknown" }));
      warning = [warning, "The course imported, but some of its quizzes could not be saved."].filter(Boolean).join(" ");
    }
  }

  return Response.json({ course: validated.course, quizzes: quizzes.length, ...(warning ? { warning } : {}) });
}
