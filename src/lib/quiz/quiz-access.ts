/** Who may reach a lesson's quiz: learners where they can see the lesson, tutors where they manage the course. */
import { db } from "@/lib/server/db";
import { manageReach, manageSql, reachParams, seeReach, seeSql } from "@/lib/server/course-scope";
import type { RequestAccess } from "@/lib/server/access";

export const LESSON_ID = /^[a-z0-9-]{1,120}$/i;

/** The lesson's course, when the person manages it (owner, their university's admin, a super admin). */
export async function managedLessonCourse(lessonId: unknown, who: RequestAccess): Promise<string | null> {
  if (typeof lessonId !== "string" || !LESSON_ID.test(lessonId)) return null;
  const { rows } = await db.query<{ course_slug: string }>(
    `SELECT l.course_slug FROM course_lessons l JOIN courses c ON c.slug = l.course_slug
      WHERE l.id=$1 AND (c.owner_user_id=$2 OR ${manageSql("c", 3, 4)})`,
    [lessonId, who.userId, ...reachParams(manageReach(who))]);
  return rows[0]?.course_slug ?? null;
}

/** The lesson's course, when the person can take its quiz: a live lesson of a published course they can see, or one they manage (to try it). */
export async function learnerLessonCourse(lessonId: unknown, who: RequestAccess): Promise<string | null> {
  if (typeof lessonId !== "string" || !LESSON_ID.test(lessonId)) return null;
  const { rows } = await db.query<{ course_slug: string }>(
    `SELECT l.course_slug FROM course_lessons l JOIN courses c ON c.slug = l.course_slug
      WHERE l.id=$1 AND (
        (c.published AND l.published AND (l.publish_at IS NULL OR l.publish_at <= NOW()) AND ${seeSql("c", 3, 4)})
        OR c.owner_user_id=$2 OR ${manageSql("c", 5, 6)})`,
    [lessonId, who.userId, ...reachParams(seeReach(who)), ...reachParams(manageReach(who))]);
  return rows[0]?.course_slug ?? null;
}
