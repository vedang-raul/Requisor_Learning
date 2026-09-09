export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { COURSE_EXPORT_FORMAT, type CourseExportPayload, type RubricCriterionExport } from "@/lib/course-export";

/** Downloads one owned course as a portable JSON export package — this
 *  app's equivalent of Canvas's course export package. See
 *  lib/course-export.ts for what is and isn't included. */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug || !SLUG_PATTERN.test(slug)) return Response.json({ error: "A valid course slug is required." }, { status: 400 });

  const { rows: courseRows } = await db.query<{
    title: string; tagline: string; category: string; level: "Beginner" | "Intermediate" | "Advanced";
    tags: string[]; base_assessment: string | null;
  }>(
    `SELECT title, tagline, category, level, tags, base_assessment FROM courses
     WHERE slug = $1 AND ($2::boolean OR owner_user_id = $3)`,
    [slug, isAdmin, userId]
  );
  const course = courseRows[0];
  if (!course) return Response.json({ error: "Course not found." }, { status: 404 });

  const { rows: lessonRows } = await db.query<{
    id: string; title: string; description: string; youtube_id: string; duration_min: number;
    resources: CourseExportPayload["lessons"][number]["resources"]; key_takeaways: string[];
    assignment: string | null; assignment_marks: number | null; assignment_due_date: Date | string | null;
    requires_submission: boolean; section: string | null; format: "video" | "reading";
    body: string | null; body_file_url: string | null;
  }>(
    `SELECT id, title, description, youtube_id, duration_min, resources, key_takeaways,
            assignment, assignment_marks, assignment_due_date, requires_submission,
            section, format, body, body_file_url
     FROM course_lessons WHERE course_slug = $1 ORDER BY position, id`,
    [slug]
  );

  const { rows: rubricRows } = await db.query<{ lesson_id: string; title: string; description: string | null; max_points: number }>(
    `SELECT lesson_id, title, description, max_points FROM assignment_rubric_criteria
     WHERE lesson_id = ANY($1::text[]) ORDER BY position, id`,
    [lessonRows.map((l) => l.id)]
  );
  const rubricByLesson = new Map<string, RubricCriterionExport[]>();
  for (const r of rubricRows) {
    const list = rubricByLesson.get(r.lesson_id) ?? [];
    list.push({ title: r.title, description: r.description, maxPoints: r.max_points });
    rubricByLesson.set(r.lesson_id, list);
  }

  const payload: CourseExportPayload = {
    format: COURSE_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    sourcePlatform: "Requisor Learning",
    course: {
      title: course.title, tagline: course.tagline, category: course.category, level: course.level,
      tags: course.tags, ...(course.base_assessment ? { baseAssessment: course.base_assessment } : {}),
    },
    lessons: lessonRows.map((l) => ({
      title: l.title, description: l.description, youtubeId: l.youtube_id, durationMin: l.duration_min,
      resources: l.resources, keyTakeaways: l.key_takeaways,
      ...(l.assignment ? { assignment: l.assignment } : {}),
      ...(l.assignment_marks ? { assignmentMarks: l.assignment_marks } : {}),
      ...(l.assignment_due_date
        ? { assignmentDueDate: new Date(l.assignment_due_date).toISOString().slice(0, 10) }
        : {}),
      ...(l.requires_submission ? { requiresSubmission: true } : {}),
      ...(l.section ? { section: l.section } : {}),
      format: l.format,
      ...(l.body ? { body: l.body } : {}),
      ...(l.body_file_url ? { bodyFileUrl: l.body_file_url } : {}),
      rubric: rubricByLesson.get(l.id) ?? [],
    })),
  };

  return Response.json(payload, {
    headers: { "Content-Disposition": `attachment; filename="${slug}-export.json"` },
  });
}
