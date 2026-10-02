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
  type: "pdf" | "link" | "file";
}

export interface CourseExportLesson {
  title: string;
  description: string;
  youtubeId: string;
  durationMin: number;
  resources: CourseExportResource[];
  keyTakeaways: string[];
  assignment?: string;
  assignmentMarks?: number;
  assignmentDueDate?: string;
  requiresSubmission?: boolean;
  section?: string;
  format?: "video" | "reading";
  body?: string;
  bodyFileUrl?: string;
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
import { isResourceFileUrl } from "@/lib/resource-files";
import { extractYouTubeId, PLACEHOLDER_VIDEO } from "@/lib/utils";
import { isIsoCalendarDate } from "@/lib/validation";

const string = (value: unknown, max: number, min = 1) =>
  typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
function safeResourceUrl(value: unknown, max = 2048): string | null {
  if (!string(value, max)) return null;
  const trimmed = (value as string).trim();
  if (trimmed === "#" || isResourceFileUrl(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function slugify(title: string): string {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    .slice(0, 70).replace(/-$/, "");
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
  if (!Array.isArray(courseIn.tags) || courseIn.tags.length > 20 ||
      !courseIn.tags.every((tag) => string(tag, 50))) {
    return { ok: false, error: "Invalid export file: invalid course tags." };
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
    if (l.resources !== undefined && !Array.isArray(l.resources)) {
      return { ok: false, error: `Lesson ${i + 1} has invalid resources.` };
    }
    const resources: Lesson["resources"] = [];
    for (const rawResource of (l.resources as unknown[] | undefined) ?? []) {
      if (resources.length >= 20 || !rawResource || typeof rawResource !== "object" || Array.isArray(rawResource)) {
        return { ok: false, error: `Lesson ${i + 1} has invalid resources.` };
      }
      const resource = rawResource as Record<string, unknown>;
      const url = safeResourceUrl(resource.url);
      if (!string(resource.label, 200) || !url ||
          (resource.type !== "pdf" && resource.type !== "link" && resource.type !== "file")) {
        return { ok: false, error: `Lesson ${i + 1} has an invalid resource.` };
      }
      resources.push({ label: (resource.label as string).trim(), url, type: resource.type });
    }
    const keyTakeaways = Array.isArray(l.keyTakeaways)
      ? l.keyTakeaways
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim().slice(0, 500))
          .filter((x) => x.length > 0)
          .slice(0, 20)
      : [];
    if (l.assignmentMarks !== undefined &&
        (!Number.isInteger(l.assignmentMarks) || (l.assignmentMarks as number) < 1 || (l.assignmentMarks as number) > 10000)) {
      return { ok: false, error: `Lesson ${i + 1} has invalid assignment points.` };
    }
    if (l.assignmentDueDate !== undefined && !isIsoCalendarDate(l.assignmentDueDate)) {
      return { ok: false, error: `Lesson ${i + 1} has an invalid assignment due date.` };
    }
    if (l.format !== undefined && l.format !== "reading" && l.format !== "video") {
      return { ok: false, error: `Lesson ${i + 1} has an invalid format.` };
    }
    const format = l.format === "reading" ? "reading" : "video";
    const bodyFileUrl = typeof l.bodyFileUrl === "string" && string(l.bodyFileUrl, 200) &&
      isResourceFileUrl(l.bodyFileUrl.trim()) ? l.bodyFileUrl.trim() : null;
    if ((l.body !== undefined && (format !== "reading" || !string(l.body, 20_000))) ||
        (l.bodyFileUrl !== undefined && (format !== "reading" || !bodyFileUrl)) ||
        (l.body !== undefined && l.bodyFileUrl !== undefined)) {
      return { ok: false, error: `Lesson ${i + 1} has invalid reading content.` };
    }
    const rawYoutubeId = typeof l.youtubeId === "string" ? l.youtubeId.trim() : "";
    const youtubeId = format === "reading"
      ? ""
      : rawYoutubeId === "" || rawYoutubeId === PLACEHOLDER_VIDEO
        ? PLACEHOLDER_VIDEO
        : extractYouTubeId(rawYoutubeId);
    if (!string(l.youtubeId, 2048, 0) || (format === "video" && !youtubeId)) {
      return { ok: false, error: `Lesson ${i + 1} has an invalid video.` };
    }
    const normalizedYoutubeId = youtubeId ?? "";
    lessons.push({
      id: lessonId,
      title: (l.title as string).trim().slice(0, 200),
      description: (l.description as string).trim().slice(0, 2000),
      youtubeId: normalizedYoutubeId,
      durationMin: Number.isInteger(l.durationMin) ? Math.min(1440, Math.max(1, l.durationMin as number)) : 20,
      resources,
      keyTakeaways,
      ...(string(l.assignment, 5000) ? { assignment: (l.assignment as string).trim().slice(0, 5000) } : {}),
      ...(l.assignmentMarks !== undefined ? { assignmentMarks: l.assignmentMarks as number } : {}),
      ...(l.assignmentDueDate !== undefined ? { assignmentDueDate: l.assignmentDueDate as string } : {}),
      ...(l.requiresSubmission === true ? { requiresSubmission: true } : {}),
      ...(string(l.section, 200) ? { section: (l.section as string).trim().slice(0, 200) } : {}),
      format,
      ...(l.body !== undefined ? { body: (l.body as string).trim() } : {}),
      ...(bodyFileUrl ? { bodyFileUrl } : {}),
    });

    if (l.rubric !== undefined &&
        (!Array.isArray(l.rubric) || l.rubric.length > MAX_IMPORT_RUBRIC_CRITERIA)) {
      return { ok: false, error: `Lesson ${i + 1} has an invalid grading rubric.` };
    }
    const rubricRaw = (l.rubric as unknown[] | undefined) ?? [];
    const rubric: RubricCriterionExport[] = [];
    for (const rc of rubricRaw) {
      if (!rc || typeof rc !== "object" || Array.isArray(rc)) {
        return { ok: false, error: `Lesson ${i + 1} has an invalid grading rubric.` };
      }
      const r = rc as Record<string, unknown>;
      if (!string(r.title, 200) || typeof r.maxPoints !== "number" || !Number.isFinite(r.maxPoints) ||
          r.maxPoints <= 0 || r.maxPoints > 1000 ||
          (r.description !== null && r.description !== undefined && !string(r.description, 1000))) {
        return { ok: false, error: `Lesson ${i + 1} has an invalid grading rubric.` };
      }
      rubric.push({
        title: (r.title as string).trim(),
        description: typeof r.description === "string" ? r.description.trim() : null,
        maxPoints: r.maxPoints,
      });
    }
    if (rubric.length) rubricByLessonId[lessonId] = rubric;
  }

  const course: Course = {
    slug,
    title: (courseIn.title as string).trim(),
    tagline: ((courseIn.tagline as string) || "").trim() || "Imported course.",
    category,
    level: courseIn.level === "Intermediate" || courseIn.level === "Advanced" ? courseIn.level : "Beginner",
    tags: courseIn.tags.map((tag) => (tag as string).trim()),
    cover: getCategoryCover(category),
    addedAt: new Date().toISOString().slice(0, 10),
    lessons,
    ...(string(courseIn.baseAssessment, 5000) ? { baseAssessment: (courseIn.baseAssessment as string).trim() } : {}),
    published: false,
  };

  return { ok: true, course, rubricByLessonId };
}
