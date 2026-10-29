import { validateCourse } from "@/lib/courses/course-catalog";
import { blueprintCourseTitle, blueprintSlug, composeCurriculum, curriculumFromCourse, curriculumToCourse, sampleDiscovery, EMPTY_DISCOVERY } from "@/lib/courses/program-builder";
import type { Course, Lesson } from "@/lib/types";

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

describe("Program from an existing course", () => {
  const lesson = (id: string, section: string, extra: Partial<Lesson> = {}): Lesson => ({ id, title: `Lesson ${id}`, description: id, youtubeId: "REPLACE_ME", durationMin: 30, resources: [], keyTakeaways: [`Takeaway ${id}`], section, ...extra });
  const course: Course = {
    slug: "agentic-ai", title: "Agentic AI", tagline: "Build agents that work.", category: "study", level: "Advanced", tags: [], cover: "x", addedAt: "2026-10-01",
    modules: [{ title: "Foundations", description: "What agents are." }, { title: "Tools" }],
    lessons: [lesson("a", "Foundations"), lesson("b", "Foundations", { assignment: "Write an agent" }), lesson("c", "Tools"), lesson("d", "Tools")],
    baseAssessment: "A capstone agent.",
  };
  const curriculum = curriculumFromCourse(course, { ...EMPTY_DISCOVERY, employer: "Acme" });

  it("uses the course's modules, lessons and assessment as the curriculum", () => {
    expect(curriculum.title).toBe("Agentic AI");
    expect(curriculum.level).toBe("Advanced");
    expect(curriculum.description).toBe("Build agents that work.");
    expect(curriculum.modules.map((m) => [m.title, m.description, m.submodules])).toEqual([
      ["Foundations", "What agents are.", ["Lesson a", "Lesson b"]],
      ["Tools", "", ["Lesson c", "Lesson d"]],
    ]);
    expect(curriculum.modules[0].activities).toEqual(["Assignment: Lesson b"]);
    expect(curriculum.duration).toBe("2 modules · 4 lessons · ~2 h");
    expect(curriculum.outcomes).toEqual(["Takeaway a", "Takeaway b", "Takeaway c", "Takeaway d"]);
    expect(curriculum.assessment).toBe("A capstone agent.");
  });

  it("makes one module from a course without modules", () => {
    const flat = curriculumFromCourse({ ...course, modules: undefined, lessons: course.lessons.map((l) => ({ ...l, section: undefined })) }, EMPTY_DISCOVERY);
    expect(flat.modules).toHaveLength(1);
    expect(flat.modules[0].title).toBe("Agentic AI");
    expect(flat.modules[0].submodules).toHaveLength(4);
  });
});
