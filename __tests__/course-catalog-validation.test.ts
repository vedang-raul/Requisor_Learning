import { validateCourse } from "@/lib/course-catalog";
import { seedCourses } from "@/lib/data";

function courseFixture() {
  return structuredClone(seedCourses[0]);
}

const resourceUrl = "/api/resources/0123456789abcdef0123456789abcdef";

describe("course catalog validation", () => {
  it("accepts an existing complete catalog course", () => {
    expect(validateCourse(courseFixture()).ok).toBe(true);
  });

  it("accepts a bounded custom category and draft status", () => {
    const course = courseFixture();
    course.category = "System Design";
    course.published = false;
    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("rejects empty, oversized, or non-string custom categories", () => {
    for (const category of ["", "x".repeat(41), 42]) {
      const course = courseFixture() as unknown as Record<string, unknown>;
      course.category = category;
      expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: false }));
    }
  });

  it("rejects normalized/non-calendar dates despite YYYY-MM-DD appearance", () => {
    const course = courseFixture();
    course.addedAt = "2026-02-30";
    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: false }));
  });

  it("accepts a tutor-uploaded file resource", () => {
    const course = courseFixture();
    course.lessons[0].resources[0] = { label: "Syllabus.pdf", url: resourceUrl, type: "file" };
    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("rejects malformed file resource URLs and unknown resource types", () => {
    const malformedUrl = courseFixture();
    malformedUrl.lessons[0].resources[0] = { label: "Syllabus.pdf", url: "/api/resources/not-a-valid-id", type: "file" };
    expect(validateCourse(malformedUrl)).toEqual(expect.objectContaining({ ok: false }));

    const unknownType = courseFixture() as unknown as { lessons: Array<{ resources: Array<{ type: string }> }> };
    unknownType.lessons[0].resources[0].type = "video";
    expect(validateCourse(unknownType)).toEqual(expect.objectContaining({ ok: false }));
  });

  it("accepts reading lessons with authored text or an attached document", () => {
    const authored = courseFixture();
    authored.lessons[0].format = "reading";
    authored.lessons[0].body = "This is the lesson content.";
    expect(validateCourse(authored)).toEqual(expect.objectContaining({ ok: true }));

    const attached = courseFixture();
    attached.lessons[0].format = "reading";
    attached.lessons[0].bodyFileUrl = resourceUrl;
    expect(validateCourse(attached)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("rejects reading lessons with conflicting or unsafe document content", () => {
    const conflicting = courseFixture();
    conflicting.lessons[0].format = "reading";
    conflicting.lessons[0].body = "Some text";
    conflicting.lessons[0].bodyFileUrl = resourceUrl;
    expect(validateCourse(conflicting)).toEqual(expect.objectContaining({ ok: false }));

    const unsafe = courseFixture();
    unsafe.lessons[0].format = "reading";
    unsafe.lessons[0].bodyFileUrl = "https://example.com/evil.pdf";
    expect(validateCourse(unsafe)).toEqual(expect.objectContaining({ ok: false }));
  });

  it("requires each lesson id to be unique and namespaced by the course slug", () => {
    const duplicate = courseFixture();
    duplicate.lessons[1].id = duplicate.lessons[0].id;
    expect(validateCourse(duplicate)).toEqual(expect.objectContaining({ ok: false }));

    const wrongNamespace = courseFixture();
    wrongNamespace.lessons[0].id = "another-course-01";
    expect(validateCourse(wrongNamespace)).toEqual(expect.objectContaining({ ok: false }));
  });

  it("rejects unsafe resource URL schemes", () => {
    const course = courseFixture();
    course.lessons[0].resources[0].url = "javascript:alert(1)";
    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: false }));
  });
});