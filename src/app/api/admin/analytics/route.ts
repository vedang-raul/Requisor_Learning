import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // A super admin sees every learner; a university admin only their university's.
  const all = session.user.superAdmin === true;
  const universityId = all ? null : session.user.universityId ?? -1;
  const people = "($1::boolean OR u.university_id = $2::int)";
  const scope = [all, universityId];

  const [usersRes, activeRes, completionsRes, courseCompletionsRes] = await Promise.all([
    // All verified users with their completion counts
    db.query<{
      id: number; name: string; email: string; employment_type: string | null;
      position: string | null; last_login_at: string | null; completion_count: string;
    }>(`
      SELECT u.id, u.name, u.email, u.employment_type, u.position, u.last_login_at,
             COUNT(lc.id) AS completion_count
      FROM users u
      LEFT JOIN lesson_completions lc ON lc.user_id = u.id
      WHERE u.email_verified = TRUE AND ${people}
      GROUP BY u.id
      ORDER BY completion_count DESC, u.name
    `, scope),
    // Active in last 7 days
    db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users u
       WHERE u.email_verified = TRUE AND u.last_login_at > NOW() - INTERVAL '7 days' AND ${people}`,
      scope
    ),
    // Total completion events
    db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM lesson_completions lc JOIN users u ON u.id = lc.user_id WHERE ${people}`, scope),
    // Completions grouped by course_slug
    db.query<{ course_slug: string; count: string }>(
      `SELECT lc.course_slug, COUNT(*) AS count FROM lesson_completions lc JOIN users u ON u.id = lc.user_id WHERE ${people} GROUP BY lc.course_slug`,
      scope
    ),
  ]);

  return NextResponse.json({
    totalUsers: usersRes.rows.length,
    activeThisWeek: parseInt(activeRes.rows[0]?.count ?? "0"),
    totalCompletions: parseInt(completionsRes.rows[0]?.count ?? "0"),
    users: usersRes.rows.map((u) => ({
      ...u,
      completion_count: parseInt(u.completion_count),
    })),
    completionsByCourse: courseCompletionsRes.rows.map((r) => ({
      courseSlug: r.course_slug,
      count: parseInt(r.count),
    })),
  });
}
