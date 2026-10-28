/**
 * Course modules, Coursera-style: a course is an ordered list of modules, each
 * with a title and an optional description, and every lesson sits in one module
 * (or none). A lesson names its module in `section`; the course keeps the
 * module order and descriptions in `modules`. Lessons whose `section` isn't in
 * that list (courses from before modules existed) still form a module of that
 * name, in the order they first appear, so nothing needs migrating.
 */
import type { Course, CourseModule, Lesson } from "@/lib/types";

export type ModuleGroup<L extends Pick<Lesson, "id" | "section">> = {
  /** null for lessons that aren't in any module. */
  title: string | null;
  description: string;
  lessons: L[];
};

const norm = (title: string) => title.trim().replace(/\s+/g, " ");
const key = (title: string) => norm(title).toLowerCase();

/** The course's modules in order: declared ones first, then any older section names. */
export function moduleList(course: { modules?: CourseModule[]; lessons: Pick<Lesson, "section">[] }): CourseModule[] {
  const seen = new Set<string>();
  const out: CourseModule[] = [];
  for (const m of course.modules ?? []) {
    const title = norm(m.title);
    if (!title || seen.has(key(title))) continue;
    seen.add(key(title));
    out.push({ title, description: m.description?.trim() || undefined });
  }
  for (const l of course.lessons) {
    const title = norm(l.section ?? "");
    if (!title || seen.has(key(title))) continue;
    seen.add(key(title));
    out.push({ title });
  }
  return out;
}

/**
 * Lessons grouped by module, in module order, keeping each lesson's place within
 * its module. Lessons without a module come last. A course with no modules is
 * one untitled group.
 */
export function groupByModule<L extends Pick<Lesson, "id" | "section">>(course: { modules?: CourseModule[]; lessons: L[] }): ModuleGroup<L>[] {
  const modules = moduleList(course);
  const groups: ModuleGroup<L>[] = modules.map((m) => ({ title: m.title, description: m.description ?? "", lessons: [] }));
  const byKey = new Map(groups.map((g) => [key(g.title!), g]));
  const loose: L[] = [];
  for (const l of course.lessons) {
    const group = l.section ? byKey.get(key(l.section)) : undefined;
    if (group) group.lessons.push(l); else loose.push(l);
  }
  if (loose.length || groups.length === 0) groups.push({ title: null, description: "", lessons: loose });
  return groups;
}

/** The course with its lessons put in module order, so "next lesson" follows the modules. */
function arranged(course: Course, modules: CourseModule[]): Course {
  const withModules = { ...course, modules };
  const lessons = groupByModule(withModules).flatMap((g) => g.lessons);
  return { ...withModules, lessons };
}

export function addModule(course: Course, title: string, description = ""): Course {
  const clean = norm(title);
  const modules = moduleList(course);
  if (!clean || modules.some((m) => key(m.title) === key(clean))) return course;
  return arranged(course, [...modules, { title: clean, description: description.trim() || undefined }]);
}

/** Renames a module (its lessons follow) and/or changes its description. */
export function updateModule(course: Course, title: string, next: { title?: string; description?: string }): Course {
  const modules = moduleList(course);
  const index = modules.findIndex((m) => key(m.title) === key(title));
  if (index < 0) return course;
  const newTitle = next.title !== undefined ? norm(next.title) : modules[index].title;
  if (!newTitle || modules.some((m, i) => i !== index && key(m.title) === key(newTitle))) return course;
  const description = next.description !== undefined ? next.description.trim() : modules[index].description ?? "";
  const updated = modules.map((m, i) => (i === index ? { title: newTitle, description: description || undefined } : m));
  const lessons = course.lessons.map((l) => (l.section && key(l.section) === key(title) ? { ...l, section: newTitle } : l));
  return arranged({ ...course, lessons }, updated);
}

/** Removes a module; its lessons stay in the course, without a module. */
export function removeModule(course: Course, title: string): Course {
  const modules = moduleList(course).filter((m) => key(m.title) !== key(title));
  const lessons = course.lessons.map((l) => (l.section && key(l.section) === key(title) ? { ...l, section: undefined } : l));
  return arranged({ ...course, lessons }, modules);
}

export function moveModule(course: Course, title: string, by: -1 | 1): Course {
  const modules = moduleList(course);
  const from = modules.findIndex((m) => key(m.title) === key(title));
  const to = from + by;
  if (from < 0 || to < 0 || to >= modules.length) return course;
  const next = [...modules];
  [next[from], next[to]] = [next[to], next[from]];
  return arranged(course, next);
}

/** Puts a lesson in a module (at its end), or takes it out of any module (null). */
export function assignLesson(course: Course, lessonId: string, moduleTitle: string | null): Course {
  const modules = moduleList(course);
  const target = moduleTitle ? modules.find((m) => key(m.title) === key(moduleTitle)) : null;
  if (moduleTitle && !target) return course;
  const lesson = course.lessons.find((l) => l.id === lessonId);
  if (!lesson) return course;
  const moved = { ...lesson, section: target?.title };
  // Last in its new module: removed, then re-added after everything else.
  return arranged({ ...course, lessons: [...course.lessons.filter((l) => l.id !== lessonId), moved] }, modules);
}

/** Moves a lesson up or down within its module. */
export function moveLesson(course: Course, lessonId: string, by: -1 | 1): Course {
  const modules = moduleList(course);
  const ordered = arranged(course, modules);
  const groups = groupByModule(ordered);
  const group = groups.find((g) => g.lessons.some((l) => l.id === lessonId));
  if (!group) return course;
  const from = group.lessons.findIndex((l) => l.id === lessonId);
  const to = from + by;
  if (to < 0 || to >= group.lessons.length) return course;
  [group.lessons[from], group.lessons[to]] = [group.lessons[to], group.lessons[from]];
  return { ...ordered, lessons: groups.flatMap((g) => g.lessons) };
}
