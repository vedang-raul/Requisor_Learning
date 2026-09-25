import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNewVideoEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Tutor-facing equivalent of /api/admin/notify-video — but scoped down:
 *  - Only the course's owner (or an admin) may trigger it.
 *  - Recipients are learners with actual activity on THIS course, not every
 *    verified user platform-wide (admin's version intentionally blasts
 *    everyone; a tutor's course is not the whole platform).
 *  - Course/lesson titles are read from the DB by slug/id, never trusted
 *    from the client, so the email body can't be spoofed.
 *  - Only counts are ever returned — never the recipient list — consistent
 *    with the rest of the tutor-facing API surface never exposing learner
 *    identities (see .agents/memory/tutor-insights-privacy.md).
 */

const canManage = (role: unknown) => role === "admin" || role === "tutor";
const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_MESSAGE_LENGTH = 500;

// 5 notification sends per tutor per hour — this fans out to real emails,
// so it needs its own limiter separate from ordinary read/write routes.
const notifyLimiter = createRateLimiter(5, 60 * 60_000);

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { limited, retryAfterMs } = notifyLimiter.check(session.user.email ?? String(session.user.id));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  const body = await req.json().catch(() => ({}));
  const { courseSlug, lessonId, message } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof courseSlug !== "string" || courseSlug.length > 80 || !COURSE_SLUG_PATTERN.test(courseSlug) ||
    typeof lessonId !== "string" || lessonId.length === 0 || lessonId.length > 120
  ) {
    return NextResponse.json({ error: "A valid course and lesson are required." }, { status: 400 });
  }
  const trimmedMessage = typeof message === "string" ? message.trim().slice(0, MAX_MESSAGE_LENGTH) : "";

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  try {
    const { rows: courseRows } = await db.query<{ slug: string; title: string }>(
      `SELECT slug, title FROM courses WHERE slug = $1 AND ($2::int IS NULL OR owner_user_id = $2)`,
      [courseSlug, isAdmin ? null : userId]
    );
    const course = courseRows[0];
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    const { rows: lessonRows } = await db.query<{ id: string; title: string }>(
      `SELECT id, title FROM course_lessons WHERE id = $1 AND course_slug = $2`,
      [lessonId, courseSlug]
    );
    const lesson = lessonRows[0];
    if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

    // Learners with any recorded activity on this course — enrollment or a
    // lesson view — not every verified user on the platform.
    const { rows: recipients } = await db.query<{ id: number; email: string; name: string | null }>(
      `SELECT DISTINCT u.id, u.email, u.name
       FROM users u
       WHERE u.role = 'employee' AND u.email_verified = TRUE
         AND (
           EXISTS (SELECT 1 FROM course_enrollments ce WHERE ce.user_id = u.id AND ce.course_slug = $1)
           OR EXISTS (SELECT 1 FROM lesson_views lv WHERE lv.user_id = u.id AND lv.course_slug = $1)
         )`,
      [courseSlug]
    );

    const link = `${getBaseUrl()}/app/learn/?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lesson.id)}`;

    let sent = 0;
    let failed = 0;
    for (const u of recipients) {
      try {
        await sendNewVideoEmail(u.email, u.name ?? "", {
          courseTitle: course.title,
          lessonTitle: lesson.title,
          message: trimmedMessage || undefined,
          link,
        });
        sent++;
      } catch (e) {
        console.error(JSON.stringify({
          operation: "tutor.notify-lesson.send",
          requestId,
          recipientId: u.id,
          error: e instanceof Error ? e.message : "unknown",
        }));
        failed++;
      }
    }

    return NextResponse.json({ ok: true, sent, total: recipients.length, failed });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "tutor.notify-lesson",
      requestId,
      userId,
      courseSlug,
      error: error instanceof Error ? error.message : "unknown",
    }));
    return NextResponse.json({ error: "Unable to send notifications." }, { status: 500 });
  }
}
