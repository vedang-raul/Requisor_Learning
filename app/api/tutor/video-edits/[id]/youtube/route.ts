export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { editedVideoSource, type VideoEditJobRow } from "@/lib/video-edit-jobs";
import { getConnection, refreshAccessToken, uploadCaptions, uploadVideo, videoDelivery, YouTubeError } from "@/lib/youtube";

/**
 * Posts a finished auto-edit to the tutor's connected YouTube channel and
 * returns the new video id (which becomes the lesson's video). Only available
 * when the "youtube" delivery mode is switched on (see lib/youtube.ts).
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
// YouTube allows 100 uploads a day per API project; keep one tutor from using them all.
const publishLimiter = createRateLimiter(10, 24 * 60 * 60_000);

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  if (videoDelivery() !== "youtube") {
    return NextResponse.json({ error: "Posting to YouTube isn't switched on. Download the video and upload it to YouTube yourself." }, { status: 409 });
  }

  const { rows } = await db.query<VideoEditJobRow>("SELECT * FROM video_edit_jobs WHERE id = $1 AND owner_user_id = $2", [id, userId]);
  const job = rows[0];
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.youtube_video_id) return NextResponse.json({ videoId: job.youtube_video_id, alreadyPosted: true });
  if (job.status !== "ready" || !job.result) return NextResponse.json({ error: "This video isn't finished yet." }, { status: 409 });
  if (job.provider === "demo") {
    return NextResponse.json({ error: "This is a demo result — there's no video file to post." }, { status: 409 });
  }
  const source = editedVideoSource(job);
  if (!source) return NextResponse.json({ error: "The edited video isn't available any more." }, { status: 409 });

  const connection = await getConnection(userId);
  if (!connection) return NextResponse.json({ error: "Connect your YouTube channel first.", code: "not_connected" }, { status: 409 });

  const { limited, retryAfterMs } = publishLimiter.check(String(userId));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  try {
    const accessToken = await refreshAccessToken(connection.refreshToken);
    const head = await fetch(source.url, { method: "HEAD", headers: source.headers });
    const sizeBytes = Number(head.headers.get("content-length"));
    if (!head.ok || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) throw new YouTubeError("Couldn't read the edited video.");

    const videoId = await uploadVideo(
      accessToken,
      { ...source, sizeBytes, contentType: head.headers.get("content-type") || "video/mp4" },
      // Unlisted: embeddable in the lesson without appearing on the channel page.
      { title: job.title, description: "Lesson video — Requisor Learning.", privacyStatus: "unlisted" }
    );
    await db.query("UPDATE video_edit_jobs SET youtube_video_id = $2, updated_at = NOW() WHERE id = $1", [id, videoId]);

    // Subtitles are a bonus: a failure here shouldn't lose the uploaded video.
    let subtitles = true;
    try {
      await uploadCaptions(accessToken, videoId, job.result.vtt);
    } catch (error) {
      subtitles = false;
      console.error(JSON.stringify({ operation: "video-edits.youtube.captions", jobId: id, error: error instanceof Error ? error.message : "unknown" }));
    }
    return NextResponse.json({ videoId, subtitles });
  } catch (error) {
    console.error(JSON.stringify({ operation: "video-edits.youtube.publish", jobId: id, error: error instanceof Error ? error.message : "unknown" }));
    const message = error instanceof YouTubeError ? error.message : "Couldn't post the video to YouTube.";
    return NextResponse.json({ error: `${message} You can still download it and upload it yourself.` }, { status: 502 });
  }
}
