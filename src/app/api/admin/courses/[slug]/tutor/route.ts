export const runtime = "nodejs";

import { db } from "@/lib/server/db";
import { requireAccess } from "@/lib/server/access";
import { assignCourseTutor, ensureCourseCatalog } from "@/lib/courses/course-catalog";
import { sendCourseAssignedEmail } from "@/lib/server/email";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";

/**
 * Super admin: who teaches a course. GET lists the tutors it can be given to
 * (its university's, or every tutor for a platform-wide course); PUT
 * { tutorId: number | null } assigns one (or none) and emails the new tutor
 * "You have been assigned to course X".
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const { slug } = await params;
  await ensureCourseCatalog();
  const { rows: courses } = await db.query<{ owner_user_id: number | null; university_id: number | null }>(
    "SELECT owner_user_id, university_id FROM courses WHERE slug = $1",
    [slug]
  );
  const course = courses[0];
  if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
  const { rows: tutors } = await db.query<{ id: number; name: string | null; email: string; university: string | null }>(
    `SELECT u.id, u.name, u.email, un.name AS university
       FROM users u LEFT JOIN universities un ON un.id = u.university_id
      WHERE u.role = 'tutor'
        AND ($1::int IS NULL OR (u.university_id = $1 AND u.university_status = 'active'))
      ORDER BY lower(coalesce(u.name, u.email))`,
    [course.university_id]
  );
  return Response.json({ tutorId: course.owner_user_id, tutors });
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const { slug } = await params;

  let body: unknown;
  try {
    body = await readJsonBody(req, 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const raw = (body as { tutorId?: unknown } | null)?.tutorId;
  if (raw !== null && !(typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0)) {
    return Response.json({ error: "Pick a tutor, or none." }, { status: 400 });
  }

  await ensureCourseCatalog();
  const result = await assignCourseTutor(slug, raw);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  // Only a new assignment is announced; the assignment stands even if the email fails.
  let emailed = false;
  if (result.changed && result.tutor) {
    try {
      await sendCourseAssignedEmail(result.tutor.email, result.tutor.name ?? "", result.course.title);
      emailed = true;
    } catch (error) {
      console.error(JSON.stringify({ event: "course_assigned_email", outcome: "failed", error: error instanceof Error ? error.message : "unknown" }));
    }
  }
  return Response.json({ tutor: result.tutor, changed: result.changed, emailed });
}
