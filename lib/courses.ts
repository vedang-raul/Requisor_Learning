import { seedCourses } from '@/lib/data'

/* Lightweight summaries of the 4 real learning paths for the anonymous
   landing page — same source data as the signed-in app's course catalog,
   trimmed to just what a course card needs (no lesson bodies/resources). */
export const landingCourses = seedCourses.map((c) => ({
  slug: c.slug,
  title: c.title,
  tagline: c.tagline,
  category: c.category,
  level: c.level,
  cover: c.cover,
  lessonCount: c.lessons.length,
  totalMin: c.lessons.reduce((a, l) => a + l.durationMin, 0),
}))

export const landingCourseBySlug = Object.fromEntries(landingCourses.map((c) => [c.slug, c]))

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
