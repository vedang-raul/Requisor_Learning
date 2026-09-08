export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/** Every assignment a learner has submitted, across all their courses —
 *  with grading status, for the "Submissions" sidebar page. Own data only:
 *  scoped to the signed-in user, no ownership check needed like the
 *  tutor-facing submission routes. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { rows: userRows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  const { rows } = await db.query<{
    id: number; lesson_id: string; lesson_title: string | null; lesson_exists: boolean;
    course_slug: string; course_title: string;
    file_name: string; file_size: number; submitted_at: string;
    marks: number | null; graded_at: string | null;
  }>(
    `SELECT s.id, s.lesson_id, l.title AS lesson_title, (l.id IS NOT NULL) AS lesson_exists,
            s.course_slug, c.title AS course_title,
            s.file_name, s.file_size, s.submitted_at, g.marks, g.graded_at
     FROM assignment_submissions s
     JOIN courses c ON c.slug = s.course_slug
     LEFT JOIN course_lessons l ON l.id = s.lesson_id
     LEFT JOIN assignment_grades g ON g.submission_id = s.id
     WHERE s.user_id = $1
     ORDER BY s.submitted_at DESC`,
    [user.id]
  );

  return Response.json({
    submissions: rows.map((r) => ({
      id: r.id,
      lessonId: r.lesson_id,
      lessonTitle: r.lesson_title ?? "Deleted lesson",
      lessonExists: r.lesson_exists,
      courseSlug: r.course_slug,
      courseTitle: r.course_title,
      fileName: r.file_name,
      fileSize: r.file_size,
      submittedAt: r.submitted_at,
      checked: r.marks !== null,
      marks: r.marks,
      gradedAt: r.graded_at,
    })),
  });
}
