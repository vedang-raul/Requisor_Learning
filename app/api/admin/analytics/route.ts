import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, ADMIN_EMAIL } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      WHERE u.email_verified = TRUE
      GROUP BY u.id
      ORDER BY completion_count DESC, u.name
    `),
    // Active in last 7 days
    db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM users
       WHERE email_verified = TRUE AND last_login_at > NOW() - INTERVAL '7 days'`
    ),
    // Total completion events
    db.query<{ count: string }>(`SELECT COUNT(*) AS count FROM lesson_completions`),
    // Completions grouped by course_slug
    db.query<{ course_slug: string; count: string }>(
      `SELECT course_slug, COUNT(*) AS count FROM lesson_completions GROUP BY course_slug`
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
