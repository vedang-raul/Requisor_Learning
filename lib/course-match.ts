import type { Course, LessonProgress } from "@/lib/types";

export type MatchProfile = {
  position?: string | null;
  qualification?: string | null;
  learningGoal?: string | null;
};

export type CourseMatch = {
  course: Course;
  score: number;
  progressPercent: number;
  completed: boolean;
  matchedTerms: string[];
};

const STOP_WORDS = new Set([
  "about", "after", "and", "are", "but", "from", "have", "into", "learn",
  "more", "that", "the", "their", "this", "with", "your",
]);

function terms(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((term) => term.length > 1 && !STOP_WORDS.has(term));
}

function courseTerms(course: Course): Set<string> {
  return new Set(terms([
    course.title,
    course.tagline,
    course.category,
    course.level,
    ...course.tags,
  ].join(" ")));
}

function progressFor(course: Course, progress: Record<string, LessonProgress>) {
  const completedLessons = course.lessons.filter((lesson) => progress[lesson.id]?.completed).length;
  const progressPercent = course.lessons.length
    ? Math.round((completedLessons / course.lessons.length) * 100)
    : 0;
  return {
    progressPercent,
    completed: course.lessons.length > 0 && completedLessons === course.lessons.length,
  };
}

/**
 * Rank the catalog using profile keywords and the learner's local progress.
 * This is intentionally deterministic and only returns catalog data; it does
 * not send profile text or progress anywhere by itself.
 */
export function scoreCourses(
  courses: Course[],
  progress: Record<string, LessonProgress>,
  profile: MatchProfile = {},
): CourseMatch[] {
  const profileFields = [
    profile.position,
    profile.qualification,
    profile.learningGoal,
  ];

  return courses
    .map((course) => {
      const availableTerms = courseTerms(course);
      const matched = new Set<string>();
      let score = 0;

      profileFields.forEach((value, fieldIndex) => {
        const weight = fieldIndex === 2 ? 3 : 2;
        terms(value ?? "").forEach((term) => {
          if (availableTerms.has(term)) {
            matched.add(term);
            score += weight;
          }
        });
      });

      const courseProgress = progressFor(course, progress);
      if (courseProgress.completed) score -= 30;
      else if (courseProgress.progressPercent > 0) score += 8;
      else score += 2;

      return {
        course,
        score,
        progressPercent: courseProgress.progressPercent,
        completed: courseProgress.completed,
        matchedTerms: Array.from(matched),
      };
    })
    .sort((a, b) =>
      b.score - a.score
      || Number(a.completed) - Number(b.completed)
      || a.course.title.localeCompare(b.course.title)
    );
}

export function formatRecommendationContext(matches: CourseMatch[]): string {
  if (matches.length === 0) return "";

  const rows = matches.slice(0, 4).map((match, index) => {
    const status = match.completed
      ? "completed"
      : match.progressPercent > 0
        ? `${match.progressPercent}% complete`
        : "not started";
    const reason = match.matchedTerms.length
      ? `profile matches: ${match.matchedTerms.slice(0, 3).join(", ")}`
      : "available starting point";
    return `${index + 1}. ${match.course.title} (slug: ${match.course.slug}) — ${status}; ${reason}`;
  });

  return [
    "Computed course ranking for the learner's next recommendation:",
    ...rows,
    "Use this ranking as guidance and avoid recommending a completed course unless the learner asks for it.",
  ].join("\n");
}