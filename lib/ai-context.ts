import { AppState } from "./types";
import { formatMinutes } from "./utils";

/**
 * Turns the local learner state into a compact text summary for the AI
 * assistant's system prompt. Keeps it short (per-course, not per-lesson
 * detail) since it's sent on every chat turn.
 */
export function buildProgressContext(state: AppState): string {
  const lines: string[] = [];

  lines.push(`XP: ${state.xp}`);

  const allLessons = state.courses.flatMap((c) => c.lessons);
  const completedLessons = allLessons.filter((l) => state.progress[l.id]?.completed);
  lines.push(`Overall: ${completedLessons.length}/${allLessons.length} lessons complete across ${state.courses.length} paths.`);

  lines.push("\nLearning paths:");
  for (const course of state.courses) {
    if (course.lessons.length === 0) continue;
    const done = course.lessons.filter((l) => state.progress[l.id]?.completed);
    const pct = Math.round((done.length / course.lessons.length) * 100);
    const inProgress = course.lessons.find((l) => {
      const p = state.progress[l.id];
      return p && !p.completed && p.watchPct > 0;
    });
    const nextUp = inProgress ?? course.lessons.find((l) => !state.progress[l.id]?.completed);
    lines.push(
      `- ${course.title} (${course.level}): ${done.length}/${course.lessons.length} done (${pct}%)` +
        (nextUp ? ` · next up: "${nextUp.title}" (${formatMinutes(nextUp.durationMin)})` : " · completed!")
    );
  }

  if (state.history.length > 0) {
    lines.push("\nRecently viewed lessons (most recent first):");
    for (const h of state.history.slice(0, 5)) {
      const course = state.courses.find((c) => c.slug === h.courseSlug);
      const lesson = course?.lessons.find((l) => l.id === h.lessonId);
      if (!course || !lesson) continue;
      const watchPct = state.progress[lesson.id]?.watchPct ?? 0;
      lines.push(`- "${lesson.title}" in ${course.title} — ${watchPct}% watched`);
    }
  }

  const completedCourses = state.courses.filter((c) => c.lessons.length > 0 && c.lessons.every((l) => state.progress[l.id]?.completed));
  if (completedCourses.length > 0) {
    lines.push(`\nBadges earned: ${completedCourses.map((c) => c.title).join(", ")}`);
  }

  const unreadNotifications = state.notifications.filter((n) => !n.read).length;
  if (unreadNotifications > 0) lines.push(`\nUnread notifications: ${unreadNotifications}`);

  return lines.join("\n");
}
