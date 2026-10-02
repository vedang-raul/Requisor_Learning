export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { AuphonicError, auphonicSubtitlesEnabled, createProduction } from "@/lib/auphonic";
import { videoEditConfigured, videoEditDemoEnabled } from "@/lib/video-edit";
import { toVideoEditJob, type VideoEditJobRow } from "@/lib/video-edit-jobs";
import { getConnection, videoDelivery, youtubeConfigured } from "@/lib/youtube";

/**
 * Auto-edit jobs for the lesson wizard: a tutor adds a long recording and gets
 * it back with subtitles, silences cut and audio evened out. GET returns what
 * is set up plus the tutor's recent jobs; POST starts a job. For a real job
 * the browser then sends the recording to the `upload` URL in the response.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const jobLimiter = createRateLimiter(10, 60 * 60_000);

async function currentUserId(): Promise<number | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return userId;
}

export async function GET() {
  const userId = await currentUserId();
  if (userId instanceof NextResponse) return userId;

  const delivery = videoDelivery();
  const [{ rows }, connection] = await Promise.all([
    db.query<VideoEditJobRow>("SELECT * FROM video_edit_jobs WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 10", [userId]),
    delivery === "youtube" ? getConnection(userId).catch(() => null) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    config: {
      /** Real processing is connected. */
      configured: videoEditConfigured(),
      /** Simulated processing with sample results (nothing is uploaded). */
      demo: videoEditDemoEnabled(),
      /** The edit includes a subtitle file. When false, YouTube's automatic captions cover it. */
      subtitles: videoEditDemoEnabled() || auphonicSubtitlesEnabled(),
      /** "download": tutor uploads to YouTube themselves. "youtube": the app posts it. */
      delivery,
      youtube: { configured: youtubeConfigured(), connected: Boolean(connection), channelTitle: connection?.channelTitle ?? null },
    },
    jobs: rows.map(toVideoEditJob),
  });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (userId instanceof NextResponse) return userId;

  const demo = videoEditDemoEnabled();
  if (!demo && !videoEditConfigured()) {
    return NextResponse.json({ error: "Automatic editing isn't set up on this server yet." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, 2048);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const { title, fileName, sourceSeconds, courseSlug } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const cleanTitle = typeof title === "string" ? title.trim().slice(0, 200) : "";
  if (!cleanTitle) return NextResponse.json({ error: "Give the lesson a title first." }, { status: 400 });
  const cleanFile = typeof fileName === "string" ? fileName.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) : "";
  if (!/\.(mp4|mov|webm|m4v)$/i.test(cleanFile)) return NextResponse.json({ error: "Choose a video file (MP4, MOV or WebM)." }, { status: 400 });
  // The browser reads the recording's real length; ignore anything implausible.
  const seconds = typeof sourceSeconds === "number" && Number.isFinite(sourceSeconds) && sourceSeconds > 0 && sourceSeconds <= 8 * 3600
    ? Math.round(sourceSeconds) : null;

  let slug: string | null = null;
  if (typeof courseSlug === "string") {
    const owned = await db.query("SELECT 1 FROM courses WHERE slug = $1 AND owner_user_id = $2", [courseSlug, userId]);
    slug = owned.rowCount ? courseSlug : null;
  }

  const { limited, retryAfterMs } = jobLimiter.check(String(userId));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  if (demo) {
    const { rows } = await db.query<VideoEditJobRow>(
      `INSERT INTO video_edit_jobs (owner_user_id, course_slug, title, file_name, source_seconds, provider)
       VALUES ($1, $2, $3, $4, $5, 'demo') RETURNING *`,
      [userId, slug, cleanTitle, cleanFile, seconds]
    );
    return NextResponse.json({ job: toVideoEditJob(rows[0]) }, { status: 201 });
  }

  let productionId: string;
  try {
    productionId = await createProduction(cleanTitle);
  } catch (error) {
    console.error(JSON.stringify({ operation: "video-edits.create", error: error instanceof Error ? error.message : "unknown" }));
    const detail = error instanceof AuphonicError && error.status === 401 ? " The editing service rejected the API key." : "";
    return NextResponse.json({ error: `Couldn't start the edit.${detail} Please try again.` }, { status: 502 });
  }
  const { rows } = await db.query<VideoEditJobRow>(
    `INSERT INTO video_edit_jobs (owner_user_id, course_slug, title, file_name, source_seconds, provider, provider_job_id)
     VALUES ($1, $2, $3, $4, $5, 'auphonic', $6) RETURNING *`,
    [userId, slug, cleanTitle, cleanFile, seconds, productionId]
  );
  return NextResponse.json({ job: toVideoEditJob(rows[0]), upload: `/api/tutor/video-edits/${rows[0].id}/upload/` }, { status: 201 });
}
