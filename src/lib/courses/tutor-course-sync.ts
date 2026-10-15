import type { Course } from "@/lib/types";

export type TutorCourseSummary = {
  course: Course;
  averageRating: number;
  ratingCount: number;
  ratingDistribution: number[] | Record<string, number>;
};

export function reconcileTutorCourses(
  courses: TutorCourseSummary[],
  selectedSlug?: string | null,
): { items: TutorCourseSummary[]; selected: Course | null } {
  return {
    items: courses,
    selected: selectedSlug ? courses.find((item) => item.course.slug === selectedSlug)?.course ?? null : null,
  };
}

export function mergeSavedTutorCourse(
  courses: TutorCourseSummary[],
  saved: Course,
): TutorCourseSummary[] {
  const existing = courses.find((item) => item.course.slug === saved.slug);
  if (!existing) {
    return [...courses, {
      course: saved,
      averageRating: 0,
      ratingCount: 0,
      ratingDistribution: {},
    }];
  }
  return courses.map((item) => item.course.slug === saved.slug ? { ...item, course: saved } : item);
}