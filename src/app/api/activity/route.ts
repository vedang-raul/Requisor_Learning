import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { pageArea } from "@/lib/activity/describe";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";

/**
 * Page time from ActivityTracker (src/components/layout/activity-tracker.tsx):
 * each visit to a page has an id, and every heartbeat adds the seconds the
 * person was actually using it. One heartbeat can add at most MAX_SECONDS,
 * so a stray or forged request can't inflate anyone's time.
 */
const MAX_SECONDS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return new Response(null, { status: 401 });

  let body: unknown;
  try {
    body = await readJsonBody(req, 2 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return new Response(null, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return new Response(null, { status: 400 });
    throw error;
  }
  const { viewId, path, search, seconds } = (body ?? {}) as { viewId?: unknown; path?: unknown; search?: unknown; seconds?: unknown };
  if (typeof viewId !== "string" || !UUID.test(viewId)) return new Response(null, { status: 400 });
  if (typeof path !== "string" || !path.startsWith("/app")) return new Response(null, { status: 400 });
  const added = typeof seconds === "number" && Number.isFinite(seconds) ? Math.min(MAX_SECONDS, Math.max(0, Math.round(seconds))) : 0;
  const where = pageArea(path.slice(0, 200), typeof search === "string" ? search.slice(0, 300) : "");

  try {
    // A view id belongs to whoever first used it; someone else's heartbeat is ignored.
    await db.query(
      `INSERT INTO page_views (id, user_id, path, area, course_slug, lesson_id, active_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE
         SET active_seconds = page_views.active_seconds + EXCLUDED.active_seconds, last_seen_at = NOW()
         WHERE page_views.user_id = EXCLUDED.user_id`,
      [viewId, userId, path.slice(0, 200), where.area, where.courseSlug, where.lessonId, added]
    );
  } catch {
    // Analytics never fails the page.
  }
  return new Response(null, { status: 204 });
}
