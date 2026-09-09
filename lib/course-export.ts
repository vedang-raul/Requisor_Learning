/**
 * Course export/import — this app's equivalent of Canvas's course export
 * package (see the Instructure guide: a course exports to a downloadable
 * file that can later be imported to recreate the course elsewhere).
 *
 * Deliberately simpler than Canvas's IMSCC/Common-Cartridge format: lesson
 * video is a YouTube link and resources are URLs, not bundled binary
 * assets, so there's nothing to zip — a plain JSON file is the whole
 * package. Two things Canvas explicitly leaves out of its exports are left
 * out here too, for the same reason (it's the learner's data, not the
 * course's): submissions and progress. What Canvas calls "course content"
 * (quizzes, assignments) has one Requisor-specific addition: an
 * assignment's grading rubric travels with its lesson, since it's authored
 * course content, not learner data.
 *
 * Importing always creates a brand-new course (owned by whoever imports
 * it), starting as an unpublished draft — there's no Canvas-style "merge
 * into an existing course" mode, since at this app's scale that complexity
 * isn't worth it; re-importing the same export just makes another course.
 */

export const COURSE_EXPORT_FORMAT = "requisor-course-export-v1";

export interface RubricCriterionExport {
  title: string;
  description: string | null;
  maxPoints: number;
}

export interface CourseExportResource {
  label: string;
  url: string;
  type: "pdf" | "link";
}

export interface CourseExportLesson {
  title: string;
  description: string;
  youtubeId: string;
  durationMin: number;
  resources: CourseExportResource[];
  keyTakeaways: string[];
  assignment?: string;
  requiresSubmission?: boolean;
  section?: string;
  format?: "video" | "reading";
  rubric: RubricCriterionExport[];
}

export interface CourseExportPayload {
  format: typeof COURSE_EXPORT_FORMAT;
  exportedAt: string;
  sourcePlatform: "Requisor Learning";
  course: {
    title: string;
    tagline: string;
    category: string;
    level: "Beginner" | "Intermediate" | "Advanced";
    tags: string[];
    baseAssessment?: string;
  };
  lessons: CourseExportLesson[];
}

export const MAX_IMPORT_LESSONS = 200;
export const MAX_IMPORT_RUBRIC_CRITERIA = 20;

import type { Course, Lesson } from "@/lib/types";
import { getCategoryCover } from "@/components/category-icon";

const string = (value: unknown, max: number, min = 1) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;

function slugify(title: string): string {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return (base || "course") + "-" + Date.now().toString(36);
}

export type CourseImportResult =
  | { ok: true; course: Course; rubricByLessonId: Record<string, RubricCriterionExport[]> }
  | { ok: false; error: string };

/**
 * Turns a parsed export file back into a real Course + a rubric-by-lesson
 * map, ready to hand to useStore().upsertCourse() and then to the rubric
 * API. Client-safe (no DB/session access) — this only shapes the data; the
 * server's own validateCourse (see lib/course-catalog.ts), run when
 * upsertCourse POSTs it, is still the final authority, so a malformed or
 * hand-edited file can't get further than a clear error message.
 */
export function buildCourseFromImport(raw: unknown): CourseImportResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "That doesn't look like a valid export file." };
  const body = raw as Record<string, unknown>;
  if (body.format !== COURSE_EXPORT_FORMAT) return { ok: false, error: "This file isn't a Requisor Learning course export." };

  const c = body.course;
  if (!c || typeof c !== "object" || Array.isArray(c)) return { ok: false, error: "Invalid export file: missing course data." };
  const courseIn = c as Record<string, unknown>;
  if (!Array.isArray(body.lessons) || body.lessons.length > MAX_IMPORT_LESSONS) {
    return { ok: false, error: "Invalid export file: missing or too many lessons." };
  }
  if (!string(courseIn.title, 160) || !string(courseIn.tagline, 400, 0) || !string(courseIn.category, 40)) {
    return { ok: false, error: "Invalid export file: missing course title or category." };
  }

  const slug = slugify(courseIn.title as string);
  const category = (courseIn.category as string).trim();
  const rubricByLessonId: Record<string, RubricCriterionExport[]> = {};
  const lessons: Lesson[] = [];

  for (let i = 0; i < body.lessons.length; i++) {
    const rawLesson = body.lessons[i];
    if (!rawLesson || typeof rawLesson !== "object" || Array.isArray(rawLesson)) return { ok: false, error: `Invalid lesson at position ${i + 1}.` };
    const l = rawLesson as Record<string, unknown>;
    if (!string(l.title, 200) || !string(l.description, 2000)) {
      return { ok: false, error: `Lesson ${i + 1} is missing a title or description.` };
    }
    const lessonId = `${slug}-${i}`;
    const resources = Array.isArray(l.resources) ? (l.resources.slice(0, 20) as Lesson["resources"]) : [];
    const keyTakeaways = Array.isArray(l.keyTakeaways)
      ? l.keyTakeaways.filter((x): x is string => typeof x === "string").slice(0, 20).map((x) => x.slice(0, 500))
      : [];
    lessons.push({
      id: lessonId,
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
    const rubric: RubricCriterionExport[] = [];
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
    if (rubric.length) rubricByLessonId[lessonId] = rubric;
  }

  const course: Course = {
    slug,
    title: (courseIn.title as string).trim(),
    tagline: ((courseIn.tagline as string) || "").trim() || "Imported course.",
    category,
    level: courseIn.level === "Intermediate" || courseIn.level === "Advanced" ? courseIn.level : "Beginner",
    tags: [(courseIn.title as string).trim()],
    cover: getCategoryCover(category),
    addedAt: new Date().toISOString().slice(0, 10),
    lessons,
    ...(string(courseIn.baseAssessment, 5000) ? { baseAssessment: (courseIn.baseAssessment as string).trim() } : {}),
    published: false,
  };

  return { ok: true, course, rubricByLessonId };
}
