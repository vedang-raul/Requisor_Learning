export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { manageReach, type Reach } from "@/lib/server/course-scope";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { buildCanvasExport, type CanvasExportRubric } from "@/lib/courses/canvas-export";
import type { Course, Lesson } from "@/lib/types";

/**
 * Downloads one owned course as a real Canvas-compatible course export
 * package (.imscc) — the same format src/lib/courses/canvas-import.ts reads, and the
 * same format a genuine Canvas export uses (see that file's header comment
 * for the confirmed structure). Re-importable into either this app or
 * Canvas itself.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Super admins reach every course; a university admin, their university's.
  const adminReach = manageReach(session.user);

  const slug = new URL(req.url).searchParams.get("slug")?.trim();
  if (!slug || !SLUG_PATTERN.test(slug)) return Response.json({ error: "A valid course slug is required." }, { status: 400 });

  const { rows: courseRows } = await db.query<{
    title: string; tagline: string; category: string; level: Course["level"];
    tags: string[]; cover: string; added_at: string; base_assessment: string | null; published: boolean;
  }>(
    `SELECT title, tagline, category, level, tags, cover, added_at, base_assessment, published FROM courses
     WHERE slug = $1 AND ($2::boolean OR (university_id IS NOT NULL AND university_id = $4::int) OR owner_user_id = $3)`,
    [slug, adminReach.all, userId, adminReach.universityId]
  );
  const courseRow = courseRows[0];
  if (!courseRow) return Response.json({ error: "Course not found." }, { status: 404 });

  const { rows: lessonRows } = await db.query<{
    id: string; title: string; description: string; youtube_id: string; duration_min: number;
    resources: Lesson["resources"]; key_takeaways: string[];
    assignment: string | null; assignment_marks: number | null; assignment_due_date: string | null;
    requires_submission: boolean; published: boolean; publish_at: Date | string | null; section: string | null; format: "video" | "reading";
    body: string | null; body_file_url: string | null;
  }>(
    `SELECT id, title, description, youtube_id, duration_min, resources, key_takeaways,
            assignment, assignment_marks, to_char(assignment_due_date, 'YYYY-MM-DD') AS assignment_due_date, requires_submission, published, publish_at,
            section, format, body, body_file_url
     FROM course_lessons WHERE course_slug = $1 ORDER BY position, id`,
    [slug]
  );

  const { rows: rubricRows } = await db.query<{ lesson_id: string; title: string; description: string | null; max_points: number }>(
    `SELECT lesson_id, title, description, max_points FROM assignment_rubric_criteria
     WHERE lesson_id = ANY($1::text[]) ORDER BY position, id`,
    [lessonRows.map((l) => l.id)]
  );
  const rubricByLesson = new Map<string, CanvasExportRubric["criteria"]>();
  for (const r of rubricRows) {
    const list = rubricByLesson.get(r.lesson_id) ?? [];
    list.push({ title: r.title, description: r.description, maxPoints: r.max_points });
    rubricByLesson.set(r.lesson_id, list);
  }
  const rubrics: CanvasExportRubric[] = [...rubricByLesson.entries()].map(([lessonId, criteria]) => ({ lessonId, criteria }));

  const course: Course = {
    slug,
    title: courseRow.title,
    tagline: courseRow.tagline,
    category: courseRow.category,
    level: courseRow.level,
    tags: courseRow.tags,
    cover: courseRow.cover,
    addedAt: new Date(courseRow.added_at).toISOString().slice(0, 10),
    published: courseRow.published,
    ...(courseRow.base_assessment ? { baseAssessment: courseRow.base_assessment } : {}),
    lessons: lessonRows.map((l) => ({
      id: l.id, title: l.title, description: l.description, youtubeId: l.youtube_id, durationMin: l.duration_min,
      resources: l.resources, keyTakeaways: l.key_takeaways,
      ...(l.assignment ? { assignment: l.assignment } : {}),
      ...(l.assignment_marks ? { assignmentMarks: l.assignment_marks } : {}),
      ...(l.assignment_due_date ? { assignmentDueDate: l.assignment_due_date } : {}),
      ...(l.requires_submission ? { requiresSubmission: true } : {}),
      ...(l.published === false ? { published: false } : {}),
      ...(l.published !== false && l.publish_at && new Date(l.publish_at).getTime() > Date.now() ? { publishAt: new Date(l.publish_at).toISOString() } : {}),
      ...(l.section ? { section: l.section } : {}),
      format: l.format,
      ...(l.body ? { body: l.body } : {}),
      ...(l.body_file_url ? { bodyFileUrl: l.body_file_url } : {}),
    })),
  };

  const zipBytes = await buildCanvasExport(course, rubrics);

  return new Response(new Uint8Array(zipBytes), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug}-export.imscc"`,
    },
  });
}
