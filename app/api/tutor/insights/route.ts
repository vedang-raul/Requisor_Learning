import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureCourseCatalog } from "@/lib/course-catalog";

const DEFAULT_DAYS = 30;
const MIN_DAYS = 7;
const MAX_DAYS = 365;
const MINIMUM_TUTOR_COHORT = 5;

type CourseRow = { slug: string; title: string; lesson_count: string };
type SummaryRow = {
  enrolled_count: string;
  started_count: string;
  completed_count: string;
  average_progress: string | null;
  recent_active_count: string;
};
type LessonRow = {
  lesson_id: string;
  title: string;
  position: string;
  started_count: string;
  completed_count: string;
};

const canManage = (role: unknown) => role === "admin" || role === "tutor";

function parseDays(value: string | null): number {
  if (value === null || value === "") return DEFAULT_DAYS;
  if (!/^\d+$/.test(value)) return 0;
  const days = Number(value);
  return Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS ? days : 0;
}

function numberFrom(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Returns aggregate course activity. No learner identifiers are selected or returned. */
export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const courseSlug = req.nextUrl.searchParams.get("courseSlug");
  const days = parseDays(req.nextUrl.searchParams.get("days"));
  if (!courseSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(courseSlug) || courseSlug.length > 80) {
    return NextResponse.json({ error: "A valid course is required." }, { status: 400 });
  }
  if (!days) return NextResponse.json({ error: `Days must be between ${MIN_DAYS} and ${MAX_DAYS}.` }, { status: 400 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = session.user.role === "admin" ? null : userId;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    await ensureCourseCatalog();
    const courseResult = await db.query<CourseRow>(
      `SELECT c.slug, c.title, COUNT(l.id)::int AS lesson_count
       FROM courses c
       LEFT JOIN course_lessons l ON l.course_slug = c.slug
       WHERE c.slug = $1 AND ($2::int IS NULL OR c.owner_user_id = $2)
       GROUP BY c.slug, c.title`,
      [courseSlug, ownerId],
    );
    const course = courseResult.rows[0];
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    const [summaryResult, lessonResult] = await Promise.all([
      db.query<SummaryRow>(
        `WITH authorized AS (
           SELECT c.slug, COUNT(l.id)::int AS lesson_count
           FROM courses c
           LEFT JOIN course_lessons l ON l.course_slug = c.slug
           WHERE c.slug = $1 AND ($3::int IS NULL OR c.owner_user_id = $3)
           GROUP BY c.slug
         ),
         activity AS (
           SELECT ce.user_id, ce.enrolled_at AS activity_at
           FROM course_enrollments ce
           JOIN authorized a ON a.slug = ce.course_slug
           JOIN users u ON u.id = ce.user_id AND u.role = 'employee'
           UNION
           SELECT lv.user_id, lv.first_viewed_at
           FROM lesson_views lv
           JOIN authorized a ON a.slug = lv.course_slug
           JOIN users u ON u.id = lv.user_id AND u.role = 'employee'
           UNION
           SELECT lc.user_id, lc.completed_at
           FROM lesson_completions lc
           JOIN authorized a ON a.slug = lc.course_slug
           JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
         ),
         cohort AS (
           SELECT DISTINCT user_id FROM activity
         ),
         started AS (
           SELECT user_id
           FROM activity
           GROUP BY user_id
           HAVING MIN(activity_at) >= $2
         ),
         learner_progress AS (
           SELECT co.user_id, a.lesson_count,
                  COUNT(DISTINCT valid_lesson.id)::int AS completed_lessons
           FROM cohort co
           CROSS JOIN authorized a
           LEFT JOIN lesson_completions lc
             ON lc.user_id = co.user_id AND lc.course_slug = a.slug
           LEFT JOIN course_lessons valid_lesson
             ON valid_lesson.course_slug = a.slug AND valid_lesson.id = lc.lesson_id
           GROUP BY co.user_id, a.lesson_count
         ),
         recent AS (
           SELECT lv.user_id FROM lesson_views lv
           JOIN authorized a ON a.slug = lv.course_slug
           JOIN users u ON u.id = lv.user_id AND u.role = 'employee'
           WHERE lv.last_viewed_at >= $2
           UNION
           SELECT lc.user_id FROM lesson_completions lc
           JOIN authorized a ON a.slug = lc.course_slug
           JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
           WHERE lc.completed_at >= $2
         )
         SELECT
           (SELECT COUNT(*) FROM cohort)::int AS enrolled_count,
           (SELECT COUNT(*) FROM started)::int AS started_count,
           (SELECT COUNT(*) FROM learner_progress WHERE lesson_count > 0 AND completed_lessons >= lesson_count)::int AS completed_count,
           (SELECT AVG(CASE WHEN lesson_count > 0 THEN LEAST(100, completed_lessons * 100.0 / lesson_count) ELSE 0 END) FROM learner_progress)::float AS average_progress,
           (SELECT COUNT(*) FROM recent)::int AS recent_active_count`,
        [courseSlug, since, ownerId],
      ),
      db.query<LessonRow>(
        `WITH authorized AS (
           SELECT c.slug
           FROM courses c
           WHERE c.slug = $1 AND ($3::int IS NULL OR c.owner_user_id = $3)
         ),
         lesson_started AS (
           SELECT lv.lesson_id, lv.user_id
           FROM lesson_views lv
           JOIN authorized a ON a.slug = lv.course_slug
           JOIN users u ON u.id = lv.user_id AND u.role = 'employee'
           WHERE lv.last_viewed_at >= $2
           UNION
           SELECT lc.lesson_id, lc.user_id
           FROM lesson_completions lc
           JOIN authorized a ON a.slug = lc.course_slug
           JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
           WHERE lc.completed_at >= $2
         ),
         lesson_completed AS (
           SELECT lc.lesson_id, lc.user_id
           FROM lesson_completions lc
           JOIN authorized a ON a.slug = lc.course_slug
           JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
           WHERE lc.completed_at >= $2
         )
         SELECT l.id AS lesson_id, l.title, l.position,
                COUNT(DISTINCT ls.user_id)::int AS started_count,
                COUNT(DISTINCT lc.user_id)::int AS completed_count
         FROM course_lessons l
         JOIN authorized a ON a.slug = l.course_slug
         LEFT JOIN lesson_started ls ON ls.lesson_id = l.id
         LEFT JOIN lesson_completed lc ON lc.lesson_id = l.id
         GROUP BY l.id, l.title, l.position
         ORDER BY l.position, l.id`,
        [courseSlug, since, ownerId],
      ),
    ]);

    const summary = summaryResult.rows[0] ?? {
      enrolled_count: "0",
      started_count: "0",
      completed_count: "0",
      average_progress: "0",
      recent_active_count: "0",
    };
    const enrolled = numberFrom(summary.enrolled_count);
    const startedTotal = numberFrom(summary.started_count);
    const completedTotal = numberFrom(summary.completed_count);
    const periodLearners = numberFrom(summary.recent_active_count);
    const rawLessons = lessonResult.rows.map((lesson) => {
      const started = numberFrom(lesson.started_count);
      const completed = numberFrom(lesson.completed_count);
      return { lesson, started, completed };
    });
    const isSmallCohort = (count: number) => count > 0 && count < MINIMUM_TUTOR_COHORT;
    const summaryHasSmallCohort = [enrolled, startedTotal, completedTotal, periodLearners].some(isSmallCohort);
    const lessonsHaveSmallCohort = rawLessons.some(({ started, completed }) =>
      isSmallCohort(started) || isSmallCohort(completed)
    );
    const suppressed = session.user.role === "tutor" && (summaryHasSmallCohort || lessonsHaveSmallCohort);
    const lessons = rawLessons.map(({ lesson, started, completed }) => {
      return {
        lessonId: lesson.lesson_id,
        title: lesson.title,
        position: numberFrom(lesson.position),
        started: suppressed ? null : started,
        completed: suppressed ? null : completed,
        completionRate: suppressed || started === 0 ? null : Math.round((completed / started) * 100),
      };
    });

    return NextResponse.json({
      course: { slug: course.slug, title: course.title, lessonCount: numberFrom(course.lesson_count) },
      period: { days, since: since.toISOString() },
      privacy: { suppressed, minimumLearners: MINIMUM_TUTOR_COHORT },
      summary: {
        enrolled: suppressed ? null : enrolled,
        started: suppressed ? null : startedTotal,
        completed: suppressed ? null : completedTotal,
        averageProgress: suppressed ? null : Math.round(numberFrom(summary.average_progress)),
        recentActive: suppressed ? null : numberFrom(summary.recent_active_count),
      },
      lessons,
    });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "tutor.insights.get",
      requestId,
      userId,
      courseSlug,
      days,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return NextResponse.json({ error: "Unable to load learner insights." }, { status: 500 });
  }
}