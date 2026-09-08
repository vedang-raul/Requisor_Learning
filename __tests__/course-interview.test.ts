import { parseCourseLessonCount } from "@/lib/course-interview";

describe("guided course interview lesson count", () => {
  it.each(["1", "2 lessons", "13", "Please make 20 lessons", "none"])(
    "does not advance for an out-of-range answer: %s",
    (answer) => {
      expect(parseCourseLessonCount(answer)).toBeNull();
    },
  );

  it.each([
    ["3", 3],
    ["Build 8 lessons", 8],
    ["12 lessons please", 12],
  ])("accepts an in-range answer: %s", (answer, expected) => {
    expect(parseCourseLessonCount(answer)).toBe(expected);
  });
});