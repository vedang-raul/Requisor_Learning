import { mergeSavedTutorCourse, reconcileTutorCourses, type TutorCourseSummary } from "@/lib/tutor-course-sync";
import type { Course, Lesson } from "@/lib/types";

const lesson = (id: string, title = id): Lesson => ({
  id,
  title,
  description: `${title} description`,
  format: "reading",
  youtubeId: "",
  durationMin: 10,
  keyTakeaways: [],
  resources: [],
});

const course = (title: string, lessons: Lesson[], revision: number): Course => ({
  slug: "course",
  title,
  tagline: "Tagline",
  category: "product",
  level: "Beginner",
  tags: [],
  cover: "from-violet-500 to-purple-500",
  addedAt: "2026-09-08",
  lessons,
  revision,
});

const summary = (value: Course): TutorCourseSummary => ({
  course: value,
  averageRating: 0,
  ratingCount: 0,
  ratingDistribution: {},
});

describe("tutor course synchronization", () => {
  it("opens a newly created course from the authoritative tutor response", () => {
    const canonical = course("Canonical title", [], 1);
    const result = reconcileTutorCourses([summary(canonical)], canonical.slug);

    expect(result.selected).toBe(canonical);
    expect(result.items[0].course.title).toBe("Canonical title");
  });

  it("updates the selected lesson list and card count from one response", () => {
    const canonical = course("Course", [lesson("one"), lesson("two")], 4);
    const result = reconcileTutorCourses([summary(canonical)], canonical.slug);

    expect(result.selected?.lessons.map((item) => item.id)).toEqual(["one", "two"]);
    expect(result.items[0].course.lessons).toHaveLength(2);
    expect(result.selected).toBe(result.items[0].course);
  });

  it("uses canonical lesson edits and deletions without retaining stale course data", () => {
    const canonical = course("Course", [lesson("one", "Updated")], 5);
    const result = reconcileTutorCourses([summary(canonical)], canonical.slug);

    expect(result.selected?.lessons).toHaveLength(1);
    expect(result.selected?.lessons[0].title).toBe("Updated");
    expect(result.selected?.revision).toBe(5);
  });

  it("keeps cards consistent with a successful mutation if summary refresh fails", () => {
    const previous = summary(course("Old title", [lesson("one")], 1));
    previous.averageRating = 4.5;
    previous.ratingCount = 2;
    const saved = course("Saved title", [lesson("one"), lesson("two")], 2);

    const result = mergeSavedTutorCourse([previous], saved);

    expect(result[0].course).toBe(saved);
    expect(result[0].course.lessons).toHaveLength(2);
    expect(result[0].averageRating).toBe(4.5);
    expect(result[0].ratingCount).toBe(2);
  });
});