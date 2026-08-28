import { seedCourses } from "@/lib/data";
import { validateCourse } from "@/lib/course-catalog";

function courseFixture() {
  // The real catalog provides a complete, schema-compatible object and avoids
  // drifting a hand-written fixture away from the public course contract.
  return structuredClone(seedCourses[0]);
}

describe("course catalog validation", () => {
  it("accepts an existing complete catalog course", () => {
    expect(validateCourse(courseFixture()).ok).toBe(true);
  });

  it("rejects normalized/non-calendar dates despite YYYY-MM-DD appearance", () => {
    const course = courseFixture();
    course.addedAt = "2026-02-30";
    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: false }));
  });

  it("requires each lesson id to be unique and namespaced by the course slug", () => {
    const course = courseFixture();
    course.lessons[1].id = course.lessons[0].id;
    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: false }));

    const other = courseFixture();
    other.lessons[0].id = "another-course-01";
    expect(validateCourse(other)).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects unsafe resource URL schemes", () => {
    const course = courseFixture();
    course.lessons[0].resources[0].url = "javascript:alert(1)";
    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: false }));
  });
});