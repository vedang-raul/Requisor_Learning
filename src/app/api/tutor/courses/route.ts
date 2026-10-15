import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { manageReach, manageSql, reachParams } from "@/lib/server/course-scope";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { ensureCourseCatalog, getCourses } from "@/lib/courses/course-catalog";
import type { Course } from "@/lib/types";

const canManage = (role: unknown) => role === "admin" || role === "tutor";
type SummaryRow = {
  course_slug: string; average_rating: string | null;
  review_count: string; one_star: string; two_star: string; three_star: string; four_star: string; five_star: string;
};

/** Ratings are aggregated; no reviewer identifiers are selected or returned. */
export async function GET() {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await ensureCourseCatalog();
    // A tutor's own courses; an admin also every course of their university (all, for super admins).
    const ownerWhere = `WHERE c.owner_user_id=$1 OR ${manageSql("c", 2, 3)}`;
    const ownerParams = [Number(session.user.id), ...reachParams(manageReach(session.user))];
    const courses = await getCourses(ownerWhere, ownerParams);
    const { rows } = await db.query<SummaryRow>(
      `SELECT c.slug AS course_slug, AVG(r.rating)::float AS average_rating, COUNT(r.id)::int AS review_count,
              COUNT(*) FILTER (WHERE r.rating=1)::int AS one_star,
              COUNT(*) FILTER (WHERE r.rating=2)::int AS two_star,
              COUNT(*) FILTER (WHERE r.rating=3)::int AS three_star,
              COUNT(*) FILTER (WHERE r.rating=4)::int AS four_star,
              COUNT(*) FILTER (WHERE r.rating=5)::int AS five_star
       FROM courses c LEFT JOIN course_reviews r ON r.course_slug=c.slug
       ${ownerWhere}
       GROUP BY c.slug`,
      ownerParams
    );
    const summaries = new Map(rows.map((row) => [row.course_slug, row]));
    return NextResponse.json({ courses: courses.map((course: Course) => {
      const row = summaries.get(course.slug);
      return {
      course,
      averageRating: row?.average_rating === null || !row ? 0 : Number(row.average_rating),
      ratingCount: Number(row?.review_count ?? 0),
      ratingDistribution: { 1: Number(row?.one_star ?? 0), 2: Number(row?.two_star ?? 0), 3: Number(row?.three_star ?? 0), 4: Number(row?.four_star ?? 0), 5: Number(row?.five_star ?? 0) },
      };
    }) });
  } catch (error) {
    console.error(JSON.stringify({ operation: "tutor.courses.get", requestId, error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ error: "Unable to load course summaries." }, { status: 500 });
  }
}