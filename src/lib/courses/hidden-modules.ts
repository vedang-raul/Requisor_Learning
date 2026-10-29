/**
 * Tutor workspace: modules a tutor has tucked away in a course's
 * "Modules & lessons" list to declutter it, like hidden courses in My Courses
 * (src/lib/courses/hidden-courses.ts). Only this tutor's editing view changes:
 * learners still see every module. Kept in this browser per account and course;
 * a module is remembered by its name, so renaming it shows it again.
 */
const KEY = "requisor-hidden-modules";

export function hiddenModulesKey(owner: string, courseSlug: string): string | null {
  const account = owner.trim().toLowerCase();
  return account && courseSlug ? `${KEY}:${encodeURIComponent(account)}:${courseSlug}` : null;
}

const norm = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

export function readHiddenModules(owner: string, courseSlug: string): string[] {
  const key = hiddenModulesKey(owner, courseSlug);
  if (!key) return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? [...new Set(saved.filter((t): t is string => typeof t === "string" && t.length > 0 && t.length <= 200).map(norm))].slice(0, 100) : [];
  } catch {
    return [];
  }
}

export function writeHiddenModules(owner: string, courseSlug: string, titles: string[]): void {
  const key = hiddenModulesKey(owner, courseSlug);
  if (!key) return;
  try {
    if (titles.length) window.localStorage.setItem(key, JSON.stringify(titles.map(norm)));
    else window.localStorage.removeItem(key);
  } catch { /* storage unavailable: hiding lasts until the page reloads */ }
}

export function isModuleHidden(hidden: string[], title: string | null): boolean {
  return title !== null && hidden.includes(norm(title));
}

/** Hides a shown module, or shows a hidden one. */
export function toggleModule(hidden: string[], title: string): string[] {
  const k = norm(title);
  return hidden.includes(k) ? hidden.filter((t) => t !== k) : [...hidden, k];
}
