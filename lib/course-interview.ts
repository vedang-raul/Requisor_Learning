export function parseCourseLessonCount(answer: string): number | null {
  const lessonCount = Number(answer.match(/\d+/)?.[0]);
  return Number.isInteger(lessonCount) && lessonCount >= 3 && lessonCount <= 12 ? lessonCount : null;
}