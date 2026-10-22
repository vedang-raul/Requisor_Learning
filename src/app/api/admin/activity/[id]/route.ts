export const runtime = "nodejs";

import { db } from "@/lib/server/db";
import { requireAccess } from "@/lib/server/access";
import { sanitizeAccessibilityPrefs } from "@/lib/accessibility/preferences";

/**
 * One person's activity profile for the super admin: who they are, every
 * recent sign-in, time spent by day, by part of the app, by course and by
 * lesson, their recent pages, and what they did there — learning for a
 * student, teaching for a tutor.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return Response.json({ error: "Not found" }, { status: 404 });
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));

  const person = await db.query<Record<string, unknown>>(
    `SELECT u.id, u.name, u.email, u.role, u.position, u.qualification, u.learning_goal, u.created_at,
            COALESCE((SELECT MAX(created_at) FROM login_events WHERE user_id = u.id), u.last_login_at) AS last_login_at,
            u.email_verified, u.google_id IS NOT NULL AS has_google, u.password_hash IS NOT NULL AS has_password,
            u.xp, u.streak_count, u.preferred_language, u.accessibility, u.onboarding_done,
            u.university_status, un.name AS university
       FROM users u LEFT JOIN universities un ON un.id = u.university_id WHERE u.id = $1`,
    [userId]
  );
  const p = person.rows[0];
  if (!p) return Response.json({ error: "Not found" }, { status: 404 });
  const isTutor = p.role === "tutor" || p.role === "admin";
  const since = [userId, days];

  const [logins, byDay, byArea, byCourse, byLesson, recent, totals, ai, learning, teaching] = await Promise.all([
    db.query(
      `SELECT created_at, method, ip, browser, os, device, country, region, city
         FROM login_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId]
    ),
    db.query(
      `SELECT d::date AS day, COALESCE(SUM(v.active_seconds), 0) AS seconds
         FROM generate_series(NOW()::date - ($2 - 1) * INTERVAL '1 day', NOW()::date, INTERVAL '1 day') d
         LEFT JOIN page_views v ON v.user_id = $1 AND v.started_at::date = d::date
        GROUP BY d ORDER BY d`,
      since
    ),
    db.query(
      `SELECT area, SUM(active_seconds) AS seconds, COUNT(*) AS views
         FROM page_views WHERE user_id = $1 AND started_at >= NOW() - $2 * INTERVAL '1 day'
        GROUP BY area ORDER BY seconds DESC`,
      since
    ),
    db.query(
      `SELECT v.course_slug, MAX(c.title) AS title, SUM(v.active_seconds) AS seconds, COUNT(*) AS views
         FROM page_views v LEFT JOIN courses c ON c.slug = v.course_slug
        WHERE v.user_id = $1 AND v.course_slug IS NOT NULL AND v.started_at >= NOW() - $2 * INTERVAL '1 day'
        GROUP BY v.course_slug ORDER BY seconds DESC LIMIT 20`,
      since
    ),
    db.query(
      `SELECT v.lesson_id, MAX(l.title) AS title, MAX(c.title) AS course, SUM(v.active_seconds) AS seconds,
              COUNT(*) AS views, MAX(v.last_seen_at) AS last_seen,
              BOOL_OR(lc.id IS NOT NULL) AS completed
         FROM page_views v
         LEFT JOIN course_lessons l ON l.id = v.lesson_id
         LEFT JOIN courses c ON c.slug = COALESCE(l.course_slug, v.course_slug)
         LEFT JOIN lesson_completions lc ON lc.user_id = v.user_id AND lc.lesson_id = v.lesson_id
        WHERE v.user_id = $1 AND v.lesson_id IS NOT NULL AND v.started_at >= NOW() - $2 * INTERVAL '1 day'
        GROUP BY v.lesson_id ORDER BY seconds DESC LIMIT 50`,
      since
    ),
    db.query(
      `SELECT v.started_at, v.last_seen_at, v.path, v.area, v.active_seconds, l.title AS lesson, c.title AS course
         FROM page_views v
         LEFT JOIN course_lessons l ON l.id = v.lesson_id
         LEFT JOIN courses c ON c.slug = v.course_slug
        WHERE v.user_id = $1 ORDER BY v.started_at DESC LIMIT 60`,
      [userId]
    ),
    db.query(
      `SELECT COALESCE(SUM(active_seconds), 0) AS seconds, COUNT(*) AS views,
              COUNT(DISTINCT started_at::date) FILTER (WHERE active_seconds > 0) AS days,
              (SELECT COUNT(*) FROM login_events WHERE user_id = $1 AND created_at >= NOW() - $2 * INTERVAL '1 day') AS logins
         FROM page_views WHERE user_id = $1 AND started_at >= NOW() - $2 * INTERVAL '1 day'`,
      since
    ),
    db.query(
      `SELECT feature, COUNT(*) AS requests, SUM(input_tokens + output_tokens) AS tokens
         FROM ai_usage WHERE user_id = $1 AND created_at >= NOW() - $2 * INTERVAL '1 day'
        GROUP BY feature ORDER BY requests DESC`,
      since
    ),
    isTutor ? Promise.resolve(null) : Promise.all([
      db.query(
        `SELECT c.slug, c.title,
                (SELECT COUNT(*) FROM course_lessons l WHERE l.course_slug = c.slug) AS lessons,
                COUNT(lc.id) AS completed, MAX(lc.completed_at) AS last_completed
           FROM lesson_completions lc JOIN courses c ON c.slug = lc.course_slug
          WHERE lc.user_id = $1 GROUP BY c.slug, c.title ORDER BY last_completed DESC`,
        [userId]
      ),
      db.query(
        `SELECT s.submitted_at, s.file_name, l.title AS lesson, c.title AS course, g.marks, g.graded_at
           FROM assignment_submissions s
           LEFT JOIN course_lessons l ON l.id = s.lesson_id
           LEFT JOIN courses c ON c.slug = s.course_slug
           LEFT JOIN assignment_grades g ON g.submission_id = s.id
          WHERE s.user_id = $1 ORDER BY s.submitted_at DESC LIMIT 50`,
        [userId]
      ),
      db.query(
        `SELECT COUNT(*) AS taken, COUNT(*) FILTER (WHERE graded_at IS NOT NULL) AS graded
           FROM generated_quizzes WHERE user_id = $1`,
        [userId]
      ),
    ]),
    isTutor ? Promise.all([
      db.query(
        `SELECT c.slug, c.title, c.published, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM course_lessons l WHERE l.course_slug = c.slug) AS lessons,
                (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_slug = c.slug) AS learners,
                (SELECT COUNT(*) FROM assignment_submissions s WHERE s.course_slug = c.slug) AS submissions
           FROM courses c WHERE c.owner_user_id = $1 ORDER BY c.updated_at DESC`,
        [userId]
      ),
      db.query(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE graded_at >= NOW() - $2 * INTERVAL '1 day') AS recent,
                AVG(marks) AS average, MAX(graded_at) AS last
           FROM assignment_grades WHERE graded_by = $1`,
        since
      ),
    ]) : Promise.resolve(null),
  ]);

  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const day = (v: unknown) => {
    const d = v instanceof Date ? v : new Date(String(v));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const t = totals.rows[0] as Record<string, unknown>;

  return Response.json({
    days,
    person: {
      id: num(p.id),
      name: p.name ?? null,
      email: p.email,
      role: isTutor ? "tutor" : "student",
      university: p.university ?? null,
      universityStatus: p.university_status ?? null,
      joinedAt: iso(p.created_at),
      lastLoginAt: iso(p.last_login_at),
      emailVerified: p.email_verified === true,
      signInOptions: [p.has_password ? "Email & password" : null, p.has_google ? "Google" : null].filter(Boolean),
      position: p.position ?? null,
      qualification: p.qualification ?? null,
      learningGoal: p.learning_goal ?? null,
      onboardingDone: p.onboarding_done === true,
      xp: num(p.xp),
      streak: num(p.streak_count),
      language: p.preferred_language ?? null,
      accessibility: Object.entries(sanitizeAccessibilityPrefs(p.accessibility)).filter(([, on]) => on).map(([key]) => key),
    },
    totals: { activeSeconds: num(t.seconds), pageViews: num(t.views), activeDays: num(t.days), logins: num(t.logins) },
    logins: logins.rows.map((r: Record<string, unknown>) => ({
      at: iso(r.created_at), method: r.method, ip: r.ip, browser: r.browser, os: r.os, device: r.device,
      place: [r.city, r.region, r.country].filter(Boolean).join(", ") || null,
    })),
    byDay: byDay.rows.map((r: Record<string, unknown>) => ({ day: day(r.day), seconds: num(r.seconds) })),
    byArea: byArea.rows.map((r: Record<string, unknown>) => ({ area: r.area, seconds: num(r.seconds), views: num(r.views) })),
    byCourse: byCourse.rows.map((r: Record<string, unknown>) => ({ slug: r.course_slug, title: r.title ?? r.course_slug, seconds: num(r.seconds), views: num(r.views) })),
    byLesson: byLesson.rows.map((r: Record<string, unknown>) => ({
      id: r.lesson_id, title: r.title ?? r.lesson_id, course: r.course ?? null, seconds: num(r.seconds),
      views: num(r.views), lastSeen: iso(r.last_seen), completed: r.completed === true,
    })),
    recent: recent.rows.map((r: Record<string, unknown>) => ({
      at: iso(r.started_at), until: iso(r.last_seen_at), path: r.path, area: r.area, seconds: num(r.active_seconds),
      lesson: r.lesson ?? null, course: r.course ?? null,
    })),
    ai: ai.rows.map((r: Record<string, unknown>) => ({ feature: r.feature, requests: num(r.requests), tokens: num(r.tokens) })),
    learning: learning ? {
      courses: learning[0].rows.map((r: Record<string, unknown>) => ({ slug: r.slug, title: r.title, lessons: num(r.lessons), completed: num(r.completed), lastCompleted: iso(r.last_completed) })),
      submissions: learning[1].rows.map((r: Record<string, unknown>) => ({ at: iso(r.submitted_at), file: r.file_name, lesson: r.lesson ?? null, course: r.course ?? null, marks: r.marks === null ? null : num(r.marks), gradedAt: iso(r.graded_at) })),
      quizzes: { taken: num(learning[2].rows[0]?.taken), graded: num(learning[2].rows[0]?.graded) },
    } : null,
    teaching: teaching ? {
      courses: teaching[0].rows.map((r: Record<string, unknown>) => ({ slug: r.slug, title: r.title, published: r.published === true, lessons: num(r.lessons), learners: num(r.learners), submissions: num(r.submissions), updatedAt: iso(r.updated_at) })),
      grading: { total: num(teaching[1].rows[0]?.total), recent: num(teaching[1].rows[0]?.recent), average: teaching[1].rows[0]?.average === null ? null : Math.round(num(teaching[1].rows[0]?.average)), last: iso(teaching[1].rows[0]?.last) },
    } : null,
  });
}
