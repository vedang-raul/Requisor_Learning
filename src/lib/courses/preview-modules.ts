/**
 * What a proposal preview link shows (see src/lib/courses/preview-links.ts for
 * the links themselves). Pure and browser-safe: the Program Builder uses it to
 * offer the modules, the server to build the reader's page.
 */
import { groupByModule } from "@/lib/courses/modules";
import { isLessonLive, isPlaceholder } from "@/lib/utils";
import type { Course, Lesson } from "@/lib/types";

export const PREVIEW_LINK_DAYS = 15;

const norm = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

/** A module a tutor can open in a link. Its key is the module's title in lower case ("" for lessons in no module). */
export type PreviewModuleChoice = { key: string; title: string; lessons: number };

/** The course's modules that have lessons learners can see, in order. */
export function previewModuleChoices(course: Pick<Course, "title" | "modules" | "lessons">, now = Date.now()): PreviewModuleChoice[] {
  const groups = groupByModule({ modules: course.modules, lessons: course.lessons.filter((l) => isLessonLive(l, now)) }).filter((g) => g.lessons.length > 0);
  return groups.map((g) => ({
    key: g.title === null ? "" : norm(g.title),
    title: g.title ?? (groups.length === 1 ? course.title : "More lessons"),
    lessons: g.lessons.length,
  }));
}

/** The requested modules, checked against the course: their keys, or null when none of them is valid. */
export function pickPreviewModules(course: Pick<Course, "title" | "modules" | "lessons">, requested: unknown, now = Date.now()): string[] | null {
  if (!Array.isArray(requested)) return null;
  const valid = new Set(previewModuleChoices(course, now).map((c) => c.key));
  const keys = [...new Set(requested.filter((k): k is string => typeof k === "string" && k.length <= 200).map(norm))].filter((k) => valid.has(k));
  return keys.length ? keys : null;
}

/** Everything a preview page gets: nothing beyond these fields leaves the server. */
export type PreviewLesson = { title: string; description: string; durationMin: number; youtubeId: string | null; keyTakeaways: string[]; body: string | null };
export type PreviewModule =
  | { open: true; title: string; description: string; lessons: PreviewLesson[] }
  | { open: false; title: string };
export type PreviewCourse = { title: string; modules: PreviewModule[]; expiresAt: string };

const lessonForPreview = (l: Lesson): PreviewLesson => ({
  title: l.title,
  description: l.description,
  durationMin: l.durationMin,
  youtubeId: (l.format ?? "video") === "video" && !isPlaceholder(l.youtubeId) ? l.youtubeId : null,
  keyTakeaways: l.keyTakeaways.slice(0, 12),
  body: (l.format === "reading" || l.format === "code-tutorial") && l.body ? l.body.slice(0, 20_000) : null,
});

/**
 * The reader's view of the course: the chosen modules with their live lessons,
 * the others as titles only. Draft and scheduled lessons never appear, and
 * neither do resources, assignments, quizzes, code or anything about the tutor.
 */
export function buildPreview(course: Pick<Course, "title" | "modules" | "lessons">, keys: string[], expiresAt: Date, now = Date.now()): PreviewCourse {
  const open = new Set(keys);
  const live = course.lessons.filter((l) => isLessonLive(l, now));
  const groups = groupByModule({ modules: course.modules, lessons: live }).filter((g) => g.lessons.length > 0);
  return {
    title: course.title,
    expiresAt: expiresAt.toISOString(),
    modules: groups.map((g): PreviewModule => {
      const title = g.title ?? (groups.length === 1 ? course.title : "More lessons");
      return open.has(g.title === null ? "" : norm(g.title))
        ? { open: true, title, description: g.description, lessons: g.lessons.map(lessonForPreview) }
        : { open: false, title };
    }),
  };
}

/** A preview link's address: an http(s) page at /p/<code>. Anything else (say, an edited saved draft) isn't shown as a link. */
export const isPreviewUrl = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 300 && /^https?:\/\/[^\s/?#]+\/p\/[A-Za-z0-9_-]{43}$/.test(value);
