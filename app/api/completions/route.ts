import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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

async function bodyFrom(req: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await bodyFrom(req);
  if (body instanceof NextResponse) return body;
  const { lessonId, courseSlug } = body;
  if (!isValidLessonId(lessonId) || !isValidSlug(courseSlug)) {
    return NextResponse.json({ error: "Invalid course completion." }, { status: 400 });
  }

  try {
    await ensureCourseCatalog();
    const result = await db.query(
      `INSERT INTO lesson_completions (user_id, lesson_id, course_slug)
       SELECT $1, l.id, l.course_slug
       FROM course_lessons l
       WHERE l.id = $2 AND l.course_slug = $3
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET course_slug = EXCLUDED.course_slug, completed_at = NOW()
       RETURNING id`,
      [userId, lessonId, courseSlug],
    );
    if (result.rowCount !== 1) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "completions.create",
      requestId,
      userId,
      courseSlug,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return NextResponse.json({ error: "Unable to update lesson completion." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await bodyFrom(req);
  if (body instanceof NextResponse) return body;
  const { lessonId } = body;
  if (!isValidLessonId(lessonId)) return NextResponse.json({ error: "Invalid lesson completion." }, { status: 400 });

  try {
    await db.query(
      `DELETE FROM lesson_completions WHERE user_id = $1 AND lesson_id = $2`,
      [userId, lessonId],
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "completions.delete",
      requestId,
      userId,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return NextResponse.json({ error: "Unable to update lesson completion." }, { status: 500 });
  }
}
