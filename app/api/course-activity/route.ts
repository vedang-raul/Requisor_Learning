import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { PoolClient } from "pg";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureCourseCatalog } from "@/lib/course-catalog";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";

const MAX_BODY_BYTES = 2 * 1024;

function isValidSlug(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidLessonId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
}

/** Record a learner opening a lesson without exposing activity to tutor clients. */
export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const courseSlug = payload.courseSlug;
  const lessonId = payload.lessonId;
  if (!isValidSlug(courseSlug) || !isValidLessonId(lessonId)) {
    return NextResponse.json({ error: "Invalid course activity." }, { status: 400 });
  }

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let client: PoolClient | null = null;
  try {
    await ensureCourseCatalog();
    client = await db.connect();
    await client.query("BEGIN");
    const validLesson = await client.query(
      `SELECT 1
       FROM courses c
       JOIN course_lessons l ON l.course_slug = c.slug
       WHERE c.slug = $1 AND l.id = $2
       LIMIT 1`,
      [courseSlug, lessonId],
    );
    if (validLesson.rowCount !== 1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }

    await client.query(
      `INSERT INTO course_enrollments (user_id, course_slug)
       VALUES ($1, $2)
       ON CONFLICT (user_id, course_slug) DO NOTHING`,
      [userId, courseSlug],
    );
    await client.query(
      `INSERT INTO lesson_views (user_id, course_slug, lesson_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET last_viewed_at = NOW(), course_slug = EXCLUDED.course_slug`,
      [userId, courseSlug, lessonId],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    console.error(JSON.stringify({
      operation: "course-activity.record",
      requestId,
      userId,
      courseSlug,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return NextResponse.json({ error: "Unable to record course activity." }, { status: 500 });
  } finally {
    client?.release();
  }
}