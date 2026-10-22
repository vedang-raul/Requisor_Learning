export const runtime = "nodejs";

import { db } from "@/lib/server/db";
import { requireAccess } from "@/lib/server/access";

/**
 * The super admin's Activity tab: everyone in one role ("student" or "tutor"),
 * optionally in one university, with what they did over the last N days.
 * Each person's full profile is /api/admin/activity/[id].
 */
export type ActivityRow = {
  id: number;
  name: string | null;
  email: string;
  universityId: number | null;
  university: string | null;
  joinedAt: string;
  lastLoginAt: string | null;
  lastLoginMethod: string | null;
  lastDevice: string | null;
  lastPlace: string | null;
  logins: number;
  activeSeconds: number;
  activeDays: number;
  pageViews: number;
  topArea: string | null;
  // Students
  lessonsCompleted: number;
  submissions: number;
  quizzes: number;
  // Tutors
  courses: number;
  gradesGiven: number;
  aiRequests: number;
};

const PERIODS = new Set([7, 30, 90, 365]);

export async function GET(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;

  const url = new URL(req.url);
  const role = url.searchParams.get("role") === "tutor" ? "tutor" : "employee";
  const days = PERIODS.has(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
  const uni = url.searchParams.get("university") ?? "all";
  // "all", "none" (no university), or a university id.
  const uniId = /^\d+$/.test(uni) ? Number(uni) : null;
  const uniFilter = uni === "none" ? "AND u.university_id IS NULL" : uniId !== null ? "AND u.university_id = $3" : "";
  const params: unknown[] = [role, days, ...(uniId !== null ? [uniId] : [])];

  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT u.id, u.name, u.email, u.university_id, un.name AS university, u.created_at,
            COALESCE(ll.created_at, u.last_login_at) AS last_login_at,
            ll.method AS last_method, ll.device AS last_device, ll.browser AS last_browser, ll.os AS last_os,
            NULLIF(concat_ws(', ', ll.city, ll.region, ll.country), '') AS last_place,
            (SELECT COUNT(*) FROM login_events l WHERE l.user_id = u.id AND l.created_at >= NOW() - $2 * INTERVAL '1 day') AS logins,
            pv.active_seconds, pv.active_days, pv.views, pv.top_area,
            (SELECT COUNT(*) FROM lesson_completions c WHERE c.user_id = u.id AND c.completed_at >= NOW() - $2 * INTERVAL '1 day') AS lessons_completed,
            (SELECT COUNT(*) FROM assignment_submissions s WHERE s.user_id = u.id AND s.submitted_at >= NOW() - $2 * INTERVAL '1 day') AS submissions,
            (SELECT COUNT(*) FROM generated_quizzes q WHERE q.user_id = u.id AND q.created_at >= NOW() - $2 * INTERVAL '1 day') AS quizzes,
            (SELECT COUNT(*) FROM courses co WHERE co.owner_user_id = u.id) AS courses,
            (SELECT COUNT(*) FROM assignment_grades g WHERE g.graded_by = u.id AND g.graded_at >= NOW() - $2 * INTERVAL '1 day') AS grades_given,
            (SELECT COUNT(*) FROM ai_usage a WHERE a.user_id = u.id AND a.created_at >= NOW() - $2 * INTERVAL '1 day') AS ai_requests
       FROM users u
       LEFT JOIN universities un ON un.id = u.university_id
       LEFT JOIN LATERAL (
         SELECT created_at, method, device, browser, os, city, region, country FROM login_events l
          WHERE l.user_id = u.id ORDER BY created_at DESC LIMIT 1
       ) ll ON TRUE
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(active_seconds), 0) AS active_seconds,
                COUNT(DISTINCT started_at::date) FILTER (WHERE active_seconds > 0) AS active_days,
                COUNT(*) AS views,
                (SELECT area FROM page_views p2 WHERE p2.user_id = u.id AND p2.started_at >= NOW() - $2 * INTERVAL '1 day'
                  GROUP BY area ORDER BY SUM(active_seconds) DESC LIMIT 1) AS top_area
           FROM page_views p WHERE p.user_id = u.id AND p.started_at >= NOW() - $2 * INTERVAL '1 day'
       ) pv ON TRUE
      WHERE u.role = $1 ${uniFilter}
      ORDER BY pv.active_seconds DESC NULLS LAST, u.last_login_at DESC NULLS LAST
      LIMIT 1000`,
    params
  );

  const n = (v: unknown) => Number(v ?? 0);
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const people: ActivityRow[] = rows.map((r) => ({
    id: n(r.id),
    name: (r.name as string | null) ?? null,
    email: r.email as string,
    universityId: r.university_id === null ? null : n(r.university_id),
    university: (r.university as string | null) ?? null,
    joinedAt: iso(r.created_at) ?? "",
    lastLoginAt: iso(r.last_login_at),
    lastLoginMethod: (r.last_method as string | null) ?? null,
    lastDevice: r.last_browser ? `${r.last_browser}, ${r.last_os}` : null,
    lastPlace: (r.last_place as string | null) ?? null,
    logins: n(r.logins),
    activeSeconds: n(r.active_seconds),
    activeDays: n(r.active_days),
    pageViews: n(r.views),
    topArea: (r.top_area as string | null) ?? null,
    lessonsCompleted: n(r.lessons_completed),
    submissions: n(r.submissions),
    quizzes: n(r.quizzes),
    courses: n(r.courses),
    gradesGiven: n(r.grades_given),
    aiRequests: n(r.ai_requests),
  }));
  return Response.json({ role: role === "tutor" ? "tutor" : "student", days, people });
}
