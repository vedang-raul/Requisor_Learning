import { validateCourse } from "@/lib/courses/course-catalog";
import { lessonThumbnail } from "@/lib/utils";

const FILE = "/api/resources/0123456789abcdef0123456789abcdef";
const course = (lesson: Record<string, unknown>) => ({
  slug: "demo", title: "Demo", tagline: "A demo", category: "study", level: "Beginner", tags: [], cover: "from-indigo-500",
  addedAt: "2026-10-28",
  lessons: [{ id: "demo-1", title: "Lesson", description: "About it", youtubeId: "dQw4w9WgXcQ", durationMin: 10, resources: [], keyTakeaways: [], ...lesson }],
});

describe("lesson thumbnails", () => {
  it("uses the tutor's picture, else the YouTube thumbnail, else none", () => {
    expect(lessonThumbnail({ thumbnailUrl: FILE, youtubeId: "dQw4w9WgXcQ" })).toBe(FILE);
    expect(lessonThumbnail({ youtubeId: "dQw4w9WgXcQ" })).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(lessonThumbnail({ youtubeId: "REPLACE_ME" })).toBeNull();
    expect(lessonThumbnail({ format: "reading", youtubeId: "" })).toBeNull();
    expect(lessonThumbnail({ format: "reading", youtubeId: "", thumbnailUrl: FILE })).toBe(FILE);
  });

  it("accepts only an uploaded image as a lesson thumbnail", () => {
    const ok = validateCourse(course({ thumbnailUrl: FILE }));
    expect(ok.ok && ok.course.lessons[0].thumbnailUrl).toBe(FILE);
    expect(validateCourse(course({})).ok).toBe(true);
    expect(validateCourse(course({ thumbnailUrl: "https://evil.example/x.png" })).ok).toBe(false);
    expect(validateCourse(course({ thumbnailUrl: "" })).ok).toBe(false);
  });
});
