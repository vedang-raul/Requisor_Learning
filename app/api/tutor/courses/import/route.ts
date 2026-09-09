export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { replaceCourse, validateCourse, CourseConflictError } from "@/lib/course-catalog";
import { getCategoryCover } from "@/components/category-icon";
import { COURSE_EXPORT_FORMAT, MAX_IMPORT_LESSONS, MAX_IMPORT_RUBRIC_CRITERIA } from "@/lib/course-export";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import type { Course, Lesson } from "@/lib/types";

/**
 * Creates a brand-new course from a previously exported JSON package (see
 * /api/tutor/courses/export). Always a new course — never merged into an
 * existing one, unlike Canvas's import tool — owned by whoever imports it,
 * and always starts as an unpublished draft so it can be reviewed before
 * going live to learners.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const MAX_IMPORT_BYTES = 512 * 1024;
const string = (value: unknown, max: number, min = 1) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;

function slugify(title: string): string {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return (base || "course") + "-" + Date.now().toString(36);
}

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

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return Response.json({ error: "That doesn't look like a valid export file." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;
  if (body.format !== COURSE_EXPORT_FORMAT) {
    return Response.json({ error: "This file isn't a Requisor Learning course export." }, { status: 400 });
  }
  const c = body.course;
  if (!c || typeof c !== "object" || Array.isArray(c)) return Response.json({ error: "Invalid export file: missing course data." }, { status: 400 });
  const courseIn = c as Record<string, unknown>;
  if (!Array.isArray(body.lessons) || body.lessons.length > MAX_IMPORT_LESSONS) {
    return Response.json({ error: "Invalid export file: missing or too many lessons." }, { status: 400 });
  }
  if (!string(courseIn.title, 160) || !string(courseIn.tagline, 400, 0) || !string(courseIn.category, 40)) {
    return Response.json({ error: "Invalid export file: missing course title or category." }, { status: 400 });
  }

  const slug = slugify(courseIn.title as string);
  const category = (courseIn.category as string).trim();

  type RubricInput = { title: string; description: string | null; maxPoints: number };
  const rubricByLessonIndex: RubricInput[][] = [];

  const lessons: Lesson[] = [];
  for (let i = 0; i < body.lessons.length; i++) {
    const rawLesson = body.lessons[i];
    if (!rawLesson || typeof rawLesson !== "object" || Array.isArray(rawLesson)) return Response.json({ error: `Invalid lesson at position ${i + 1}.` }, { status: 400 });
    const l = rawLesson as Record<string, unknown>;
    if (!string(l.title, 200) || !string(l.description, 2000)) {
      return Response.json({ error: `Lesson ${i + 1} is missing a title or description.` }, { status: 400 });
    }
    const resources = Array.isArray(l.resources) ? l.resources.slice(0, 20) as Lesson["resources"] : [];
    const keyTakeaways = Array.isArray(l.keyTakeaways) ? l.keyTakeaways.filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 500)) : [];
    lessons.push({
      id: `${slug}-${i}`,
      title: (l.title as string).trim().slice(0, 200),
      description: (l.description as string).trim().slice(0, 2000),
      youtubeId: string(l.youtubeId, 120, 0) ? (l.youtubeId as string).trim().slice(0, 120) : "REPLACE_ME",
      durationMin: Number.isInteger(l.durationMin) ? Math.min(1440, Math.max(1, l.durationMin as number)) : 20,
      resources,
      keyTakeaways,
      ...(string(l.assignment, 5000) ? { assignment: (l.assignment as string).trim().slice(0, 5000) } : {}),
      ...(l.requiresSubmission === true ? { requiresSubmission: true } : {}),
      ...(string(l.section, 200) ? { section: (l.section as string).trim().slice(0, 200) } : {}),
      format: l.format === "reading" ? "reading" : "video",
    });

    const rubricRaw = Array.isArray(l.rubric) ? l.rubric.slice(0, MAX_IMPORT_RUBRIC_CRITERIA) : [];
    const rubric: RubricInput[] = [];
    for (const rc of rubricRaw) {
      if (!rc || typeof rc !== "object") continue;
      const r = rc as Record<string, unknown>;
      const maxPoints = Number(r.maxPoints);
      if (string(r.title, 200) && Number.isFinite(maxPoints) && maxPoints > 0 && maxPoints <= 1000) {
        rubric.push({
          title: (r.title as string).trim(),
          description: string(r.description, 1000) ? (r.description as string).trim() : null,
          maxPoints,
        });
      }
    }
    rubricByLessonIndex.push(rubric);
  }

  const candidate = {
    slug, title: (courseIn.title as string).trim(), tagline: ((courseIn.tagline as string) || "Imported course.").trim() || "Imported course.",
    category, level: courseIn.level === "Intermediate" || courseIn.level === "Advanced" ? courseIn.level : "Beginner",
    tags: [(courseIn.title as string).trim()], cover: getCategoryCover(category),
    addedAt: new Date().toISOString().slice(0, 10), lessons,
    ...(string(courseIn.baseAssessment, 5000) ? { baseAssessment: (courseIn.baseAssessment as string).trim() } : {}),
    published: false,
  };

  const validated = validateCourse(candidate);
  if (!validated.ok) return Response.json({ error: `Invalid export file: ${validated.error}` }, { status: 400 });

  try {
    await replaceCourse(validated.course as Course, userId, false, true);
  } catch (error) {
    if (error instanceof CourseConflictError) {
      return Response.json({ error: "A course with that slug already exists — try importing again." }, { status: 409 });
    }
    console.error(JSON.stringify({ operation: "tutor.course.import", userId, error: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Couldn't import the course." }, { status: 500 });
  }

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
      console.error(JSON.stringify({ operation: "tutor.course.import.rubric", slug, error: error instanceof Error ? error.message : "unknown" }));
    } finally {
      client.release();
    }
  }

  return Response.json({ course: validated.course });
}
