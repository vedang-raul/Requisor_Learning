import { seedCourses } from "@/lib/data";
import { validateCourse } from "@/lib/course-catalog";
import { extractYouTubeId } from "@/lib/utils";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("YouTube lesson input", () => {
  it.each([
    VIDEO_ID,
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    `https://www.youtube.com/watch?si=abc&v=${VIDEO_ID}&feature=shared`,
    `https://youtu.be/${VIDEO_ID}?si=abc`,
    `https://www.youtube.com/embed/${VIDEO_ID}`,
    `https://www.youtube.com/shorts/${VIDEO_ID}`,
    `https://www.youtube.com/live/${VIDEO_ID}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
  ])("extracts the canonical ID from %s", (input) => {
    expect(extractYouTubeId(input)).toBe(VIDEO_ID);
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "not-a-valid-video-id",
  ])("rejects non-YouTube or malformed input %s", (input) => {
    expect(extractYouTubeId(input)).toBeNull();
  });

  it("canonicalizes a creator-pasted YouTube URL before persistence", () => {
    const course = structuredClone(seedCourses[0]);
    course.lessons[0].youtubeId = `https://youtu.be/${VIDEO_ID}?si=creator-share`;

    const result = validateCourse(course);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course.lessons[0].youtubeId).toBe(VIDEO_ID);
  });

  it("rejects an invalid video value at the server boundary", () => {
    const course = structuredClone(seedCourses[0]);
    course.lessons[0].youtubeId = "https://example.com/not-youtube";

    expect(validateCourse(course)).toEqual(expect.objectContaining({ ok: false }));
  });
});