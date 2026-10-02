import { validateCourse } from "@/lib/course-catalog";
import { seedCourses } from "@/lib/data";
import { isLessonLive, isLessonScheduled } from "@/lib/utils";

const HOUR = 3_600_000;
const inFuture = () => new Date(Date.now() + HOUR).toISOString();
const inPast = () => new Date(Date.now() - HOUR).toISOString();

describe("scheduled lesson launch", () => {
  it("hides a published lesson from learners until its go-live time", () => {
    expect(isLessonScheduled({ publishAt: inFuture() })).toBe(true);
    expect(isLessonLive({ publishAt: inFuture() })).toBe(false);
  });

  it("is live once the time has passed, or when there is no schedule", () => {
    expect(isLessonLive({ publishAt: inPast() })).toBe(true);
    expect(isLessonLive({})).toBe(true);
    expect(isLessonLive({ published: true })).toBe(true);
  });

  it("keeps a draft hidden whatever its schedule says", () => {
    expect(isLessonLive({ published: false, publishAt: inPast() })).toBe(false);
    expect(isLessonScheduled({ published: false, publishAt: inFuture() })).toBe(false);
  });

  it("accepts a real date as the launch time and rejects anything else", () => {
    const withLaunch = (publishAt: unknown) => {
      const course = structuredClone(seedCourses[0]) as unknown as { lessons: Array<Record<string, unknown>> };
      course.lessons[0].publishAt = publishAt;
      return validateCourse(course).ok;
    };
    expect(withLaunch(inFuture())).toBe(true);
    expect(withLaunch("next tuesday-ish")).toBe(false);
    expect(withLaunch(1790000000000)).toBe(false);
    expect(withLaunch("")).toBe(false);
  });
});
