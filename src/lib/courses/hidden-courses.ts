/**
 * Tutor workspace: courses a tutor has hidden from their My Courses grid to
 * declutter it. Only this tutor's view changes; learners, publishing and the
 * course itself are untouched. Kept in this browser per account, so it is a
 * display preference, never a permission.
 */
const KEY = "requisor-hidden-courses";

export function hiddenCoursesKey(owner: string): string | null {
  const account = owner.trim().toLowerCase();
  return account ? `${KEY}:${encodeURIComponent(account)}` : null;
}

/** The hidden slugs saved for this account (browser only); empty when nothing is saved or storage is blocked. */
export function readHiddenCourses(owner: string): string[] {
  const key = hiddenCoursesKey(owner);
  if (!key) return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) ? [...new Set(saved.filter((slug): slug is string => typeof slug === "string" && slug.length > 0 && slug.length <= 120))].slice(0, 500) : [];
  } catch {
    return [];
  }
}

export function writeHiddenCourses(owner: string, slugs: string[]): void {
  const key = hiddenCoursesKey(owner);
  if (!key) return;
  try {
    if (slugs.length) window.localStorage.setItem(key, JSON.stringify(slugs));
    else window.localStorage.removeItem(key);
  } catch { /* storage unavailable: hiding lasts until the page reloads */ }
}

/** Splits the courses into those shown and those hidden, keeping their order. Hidden slugs no longer in the list are ignored. */
export function partitionHidden<T extends { course: { slug: string } }>(items: T[], hidden: string[]): { visible: T[]; hidden: T[] } {
  const set = new Set(hidden);
  return { visible: items.filter((item) => !set.has(item.course.slug)), hidden: items.filter((item) => set.has(item.course.slug)) };
}
