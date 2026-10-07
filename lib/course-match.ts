import type { Course, LessonProgress } from "@/lib/types";

export type MatchProfile = {
  position?: string | null;
  qualification?: string | null;
  learningGoal?: string | null;
  /** What the learner has said in the current chat. Counts for more than the saved profile, which may be out of date. */
  conversation?: string | null;
};

export type CourseMatch = {
  course: Course;
  score: number;
  progressPercent: number;
  completed: boolean;
  matchedTerms: string[];
  /** The matched terms that came from what the learner said in the chat. */
  saidTerms: string[];
};

const STOP_WORDS = new Set([
  "about", "after", "and", "are", "but", "from", "have", "into", "learn",
  "more", "that", "the", "their", "this", "with", "your",
  // chat filler: these appear in course text too, and must not count as a match
  "course", "courses", "lesson", "lessons", "what", "which", "should", "want", "take", "next", "for", "you", "can", "how",
  "get", "start", "work", "need", "would", "like", "best", "good", "new", "any", "some", "there", "here", "who", "why",
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
      const said = new Set<string>();
      let score = 0;

      new Set(terms(profile.conversation ?? "")).forEach((term) => {
        if (availableTerms.has(term)) { matched.add(term); said.add(term); score += 6; }
      });

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
        saidTerms: Array.from(said),
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

  // Every course is listed, so none looks unavailable just because it ranked low.
  const rows = matches.slice(0, 12).map((match, index) => {
    const status = match.completed
      ? "completed"
      : match.progressPercent > 0
        ? `${match.progressPercent}% complete`
        : "not started";
    const profileTerms = match.matchedTerms.filter((term) => !match.saidTerms.includes(term));
    const reason = match.saidTerms.length
      ? `matches what they said in this chat: ${match.saidTerms.slice(0, 4).join(", ")}`
      : profileTerms.length
        ? `saved profile matches: ${profileTerms.slice(0, 3).join(", ")}`
        : "no specific match";
    return `${index + 1}. ${match.course.title} (slug: ${match.course.slug}) — ${status}; ${reason}`;
  });

  const anySignal = matches.some((match) => match.matchedTerms.length > 0 || match.progressPercent > 0);
  return [
    anySignal
      ? "Default course order from keyword matches and progress (a rough guide, not a verdict):"
      : "Nothing in the saved profile, the chat or their progress points to a particular course. The order below is alphabetical and is NOT a recommendation; ask what they do or want to learn:",
    ...rows,
    "Keyword matching is crude: judge fit yourself from the catalog and from what the learner says. Avoid recommending a completed course unless they ask for it.",
  ].join("\n");
}