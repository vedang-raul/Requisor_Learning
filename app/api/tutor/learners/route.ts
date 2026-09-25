import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureCourseCatalog } from "@/lib/course-catalog";

/**
 * Cross-course learner rollup for a tutor's own catalog.
 *
 * Aggregate-only, same as /api/tutor/insights: no learner identifiers are
 * selected or returned, and any metric backed by a cohort smaller than
 * MINIMUM_TUTOR_COHORT is suppressed server-side. See
 * .agents/memory/tutor-insights-privacy.md — the threshold is checked
 * against each metric's own population, not inherited from another metric.
 */

const DEFAULT_DAYS = 30;
const MIN_DAYS = 7;
const MAX_DAYS = 365;
const MINIMUM_TUTOR_COHORT = 5;

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

function isSmallCohort(count: number): boolean {
  return count > 0 && count < MINIMUM_TUTOR_COHORT;
}

type CourseRollupRow = {
  slug: string;
  title: string;
  lesson_count: string;
  enrolled_count: string;
  recent_active_count: string;
  completed_count: string;
};

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const days = parseDays(req.nextUrl.searchParams.get("days"));
  if (!days) return NextResponse.json({ error: `Days must be between ${MIN_DAYS} and ${MAX_DAYS}.` }, { status: 400 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = session.user.role === "admin" ? null : userId;
  const isTutor = session.user.role === "tutor";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    await ensureCourseCatalog();

    const [rollupResult, cohortResult, recentResult] = await Promise.all([
      db.query<CourseRollupRow>(
        `WITH authorized AS (
           SELECT c.slug, c.title, COUNT(l.id)::int AS lesson_count
           FROM courses c
           LEFT JOIN course_lessons l ON l.course_slug = c.slug
           WHERE ($1::int IS NULL OR c.owner_user_id = $1)
           GROUP BY c.slug, c.title
         ),
         activity AS (
           SELECT DISTINCT ce.user_id, ce.course_slug
           FROM course_enrollments ce
           JOIN authorized a ON a.slug = ce.course_slug
           JOIN users u ON u.id = ce.user_id AND u.role = 'employee'
           UNION
           SELECT DISTINCT lv.user_id, lv.course_slug
           FROM lesson_views lv
           JOIN authorized a ON a.slug = lv.course_slug
           JOIN users u ON u.id = lv.user_id AND u.role = 'employee'
           UNION
           SELECT DISTINCT lc.user_id, lc.course_slug
           FROM lesson_completions lc
           JOIN authorized a ON a.slug = lc.course_slug
           JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
         ),
         recent AS (
           SELECT DISTINCT lv.user_id, lv.course_slug
           FROM lesson_views lv
           JOIN authorized a ON a.slug = lv.course_slug
           JOIN users u ON u.id = lv.user_id AND u.role = 'employee'
           WHERE lv.last_viewed_at >= $2
           UNION
           SELECT DISTINCT lc.user_id, lc.course_slug
           FROM lesson_completions lc
           JOIN authorized a ON a.slug = lc.course_slug
           JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
           WHERE lc.completed_at >= $2
         ),
         course_progress AS (
           SELECT act.user_id, act.course_slug, a.lesson_count,
                  COUNT(DISTINCT vl.id)::int AS completed_lessons
           FROM activity act
           JOIN authorized a ON a.slug = act.course_slug
           LEFT JOIN lesson_completions lc ON lc.user_id = act.user_id AND lc.course_slug = act.course_slug
           LEFT JOIN course_lessons vl ON vl.course_slug = act.course_slug AND vl.id = lc.lesson_id
           GROUP BY act.user_id, act.course_slug, a.lesson_count
         )
         SELECT
           a.slug, a.title, a.lesson_count,
           COUNT(DISTINCT act.user_id)::int AS enrolled_count,
           COUNT(DISTINCT r.user_id)::int AS recent_active_count,
           COUNT(DISTINCT CASE WHEN cp.lesson_count > 0 AND cp.completed_lessons >= cp.lesson_count THEN cp.user_id END)::int AS completed_count
         FROM authorized a
         LEFT JOIN activity act ON act.course_slug = a.slug
         LEFT JOIN recent r ON r.course_slug = a.slug AND r.user_id = act.user_id
         LEFT JOIN course_progress cp ON cp.course_slug = a.slug AND cp.user_id = act.user_id
         GROUP BY a.slug, a.title, a.lesson_count
         ORDER BY a.title`,
        [ownerId, since]
      ),
      db.query<{ total: string }>(
        `WITH authorized AS (
           SELECT c.slug FROM courses c WHERE ($1::int IS NULL OR c.owner_user_id = $1)
         )
         SELECT COUNT(DISTINCT user_id)::int AS total FROM (
           SELECT ce.user_id FROM course_enrollments ce
             JOIN authorized a ON a.slug = ce.course_slug
             JOIN users u ON u.id = ce.user_id AND u.role = 'employee'
           UNION
           SELECT lv.user_id FROM lesson_views lv
             JOIN authorized a ON a.slug = lv.course_slug
             JOIN users u ON u.id = lv.user_id AND u.role = 'employee'
           UNION
           SELECT lc.user_id FROM lesson_completions lc
             JOIN authorized a ON a.slug = lc.course_slug
             JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
         ) combined`,
        [ownerId]
      ),
      db.query<{ total: string }>(
        `WITH authorized AS (
           SELECT c.slug FROM courses c WHERE ($1::int IS NULL OR c.owner_user_id = $1)
         )
         SELECT COUNT(DISTINCT user_id)::int AS total FROM (
           SELECT lv.user_id FROM lesson_views lv
             JOIN authorized a ON a.slug = lv.course_slug
             JOIN users u ON u.id = lv.user_id AND u.role = 'employee'
             WHERE lv.last_viewed_at >= $2
           UNION
           SELECT lc.user_id FROM lesson_completions lc
             JOIN authorized a ON a.slug = lc.course_slug
             JOIN users u ON u.id = lc.user_id AND u.role = 'employee'
             WHERE lc.completed_at >= $2
         ) combined`,
        [ownerId, since]
      ),
    ]);

    const totalCohort = numberFrom(cohortResult.rows[0]?.total);
    const totalRecentActive = numberFrom(recentResult.rows[0]?.total);
    const totalCompletions = rollupResult.rows.reduce((sum, row) => sum + numberFrom(row.completed_count), 0);
    const overallSuppressed = isTutor && isSmallCohort(totalCohort);

    const courses = rollupResult.rows.map((row) => {
      const enrolled = numberFrom(row.enrolled_count);
      const active = numberFrom(row.recent_active_count);
      const completed = numberFrom(row.completed_count);
      const rowSuppressed = isTutor && (isSmallCohort(enrolled) || isSmallCohort(active) || isSmallCohort(completed));
      return {
        slug: row.slug,
        title: row.title,
        lessonCount: numberFrom(row.lesson_count),
        suppressed: rowSuppressed,
        enrolled: rowSuppressed ? null : enrolled,
        active: rowSuppressed ? null : active,
        completed: rowSuppressed ? null : completed,
      };
    });

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      privacy: { minimumLearners: MINIMUM_TUTOR_COHORT },
      overall: {
        suppressed: overallSuppressed,
        totalLearners: overallSuppressed ? null : totalCohort,
        activeInPeriod: overallSuppressed ? null : totalRecentActive,
        totalCompletions: overallSuppressed ? null : totalCompletions,
      },
      courses,
    });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "tutor.learners.get",
      requestId,
      userId,
      days,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return NextResponse.json({ error: "Unable to load learner rollup." }, { status: 500 });
  }
}
