import { validateCourse } from "@/lib/courses/course-catalog";
import { blueprintCourseTitle, blueprintSlug, composeCurriculum, curriculumToCourse, sampleDiscovery, EMPTY_DISCOVERY } from "@/lib/courses/program-builder";

describe("Curriculum blueprint course", () => {
  const curriculum = composeCurriculum(sampleDiscovery(EMPTY_DISCOVERY));
  const course = curriculumToCourse(curriculum, { slug: blueprintSlug(curriculum.title), category: "study", cover: "from-indigo-500", fallbackLevel: "Beginner", today: new Date("2026-10-26T12:00:00Z") });

  it("is a valid private draft named as the program's blueprint", () => {
    expect(validateCourse(course).ok).toBe(true);
    expect(course.slug).toBe("ai-applications-in-pre-construction-blueprint");
    expect(course.title).toBe("AI Applications In Pre-Construction — Curriculum Blueprint");
    expect(course.published).toBe(false);
    expect(course.level).toBe("Intermediate");
    expect(course.addedAt).toBe("2026-10-26");
    expect(course.baseAssessment).toBe(curriculum.assessment);
  });

  it("makes each module a section with a draft lesson per submodule and its activities as the last lesson's assignment", () => {
    const first = curriculum.modules[0];
    const lessons = course.lessons.filter((l) => l.section === `Module 1: ${first.title}`);
    expect(lessons.map((l) => l.title)).toEqual(first.submodules);
    expect(course.lessons).toHaveLength(curriculum.modules.reduce((n, m) => n + m.submodules.length, 0));
    expect(course.lessons.every((l) => l.published === false && l.id.startsWith(`${course.slug}-`))).toBe(true);
    expect(lessons.at(-1)?.assignment).toContain(first.activities[0]);
    expect(lessons[0].assignment).toBeUndefined();
  });

  it("keeps long titles within the course limits", () => {
    expect(blueprintCourseTitle("x".repeat(300)).length).toBeLessThanOrEqual(160);
    expect(blueprintSlug("Ünïcode & symbols!! ".repeat(10)).length).toBeLessThanOrEqual(80);
    expect(blueprintSlug("!!!")).toBe("program-blueprint");
  });
});
