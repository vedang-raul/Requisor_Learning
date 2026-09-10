import { buildCourseFromImport, COURSE_EXPORT_FORMAT } from "@/lib/course-export";
import { validateCourse } from "@/lib/course-catalog";

const resourceFileUrl = "/api/resources/0123456789abcdef0123456789abcdef";

function packageFixture() {
  return {
    format: COURSE_EXPORT_FORMAT,
    exportedAt: "2026-09-09T10:00:00.000Z",
    sourcePlatform: "Requisor Learning",
    course: {
      title: "Leading Teams",
      tagline: "Practical leadership skills",
      category: "Leadership",
      level: "Intermediate",
      tags: ["leadership", "teams"],
    },
    lessons: [{
      title: "Leadership Foundations",
      description: "Learn the foundations.",
      youtubeId: "",
      durationMin: 25,
      resources: [{ label: "Workbook", url: "https://example.com/workbook.pdf", type: "pdf" }],
      keyTakeaways: ["Set clear expectations"],
      format: "reading",
      bodyFileUrl: resourceFileUrl,
      rubric: [{ title: "Clarity", description: null, maxPoints: 20 }],
    }],
  };
}

describe("course import validation compatibility", () => {
  it("produces a course accepted by the real server validator", () => {
    const result = buildCourseFromImport(packageFixture());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.course.lessons[0].bodyFileUrl).toBe(resourceFileUrl);
    expect(validateCourse(result.course)).toEqual(expect.objectContaining({ ok: true }));
  });

  it.each([
    [
      { body: "x".repeat(20_001), bodyFileUrl: undefined },
      "Lesson 1 has invalid reading content.",
    ],
    [
      { bodyFileUrl: "https://example.com/reading.pdf" },
      "Lesson 1 has invalid reading content.",
    ],
    [
      { body: "Authored content", bodyFileUrl: resourceFileUrl },
      "Lesson 1 has invalid reading content.",
    ],
    [
      { format: "video", youtubeId: "not-a-youtube-video", bodyFileUrl: undefined },
      "Lesson 1 has an invalid video.",
    ],
  ])("rejects input that the catalog would reject for case %#", (lessonPatch, error) => {
    const fixture = packageFixture();
    Object.assign(fixture.lessons[0], lessonPatch);

    expect(buildCourseFromImport(fixture)).toEqual({ ok: false, error });
  });

  it("rejects invalid tags instead of creating an oversized fallback tag", () => {
    const fixture = packageFixture();
    fixture.course.title = "A".repeat(160);
    fixture.course.tags = ["A".repeat(51)];

    expect(buildCourseFromImport(fixture)).toEqual({
      ok: false,
      error: "Invalid export file: invalid course tags.",
    });
  });

  it("keeps generated slugs and lesson IDs within server limits", () => {
    const fixture = packageFixture();
    fixture.course.title = "A".repeat(160);
    fixture.course.tags = ["A valid tag"];
    const result = buildCourseFromImport(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.course.slug.length).toBeLessThanOrEqual(80);
    expect(result.course.lessons[0].id.length).toBeLessThanOrEqual(120);
    expect(validateCourse(result.course)).toEqual(expect.objectContaining({ ok: true }));
  });

  it("removes empty takeaways and emits only server-valid values", () => {
    const fixture = packageFixture();
    fixture.lessons[0].keyTakeaways = ["  ", "  A useful point  "];
    const result = buildCourseFromImport(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.course.lessons[0].keyTakeaways).toEqual(["A useful point"]);
    expect(validateCourse(result.course)).toEqual(expect.objectContaining({ ok: true }));
  });
});