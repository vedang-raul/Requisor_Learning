export const runtime = "nodejs";
// Long recordings take a while to pass through. 300 seconds is the most Vercel's
// free plan accepts (a larger value fails the whole deployment); hosts that run
// the app as an ordinary server, like Render, ignore this.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AuphonicError, forwardUpload, startProduction } from "@/lib/auphonic";
import { failVideoEditJob, type VideoEditJobRow } from "@/lib/video-edit-jobs";

/**
 * Receives the tutor's recording for an auto-edit job and streams it straight
 * on to Auphonic, then starts the edit. Nothing is stored on this server.
 * The body is a multipart form with one file field, `input_file`.
 * (middleware.ts skips this route so the body isn't buffered in memory.)
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const MAX_UPLOAD_BYTES = 4 * 1024 ** 3;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const contentType = req.headers.get("content-type") ?? "";
  const contentLength = Number(req.headers.get("content-length"));
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType) || !req.body) {
    return NextResponse.json({ error: "Send the recording as a file upload." }, { status: 400 });
  }
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) return NextResponse.json({ error: "The recording is empty." }, { status: 400 });
  if (contentLength > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Recordings can be up to 4 GB." }, { status: 413 });

  const { rows } = await db.query<VideoEditJobRow>("SELECT * FROM video_edit_jobs WHERE id = $1 AND owner_user_id = $2", [id, userId]);
  const job = rows[0];
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.provider !== "auphonic" || job.status !== "processing" || !job.provider_job_id) {
    return NextResponse.json({ error: "This edit isn't waiting for a recording." }, { status: 409 });
  }

  try {
    await forwardUpload(job.provider_job_id, req.body, { contentType, contentLength });
    await startProduction(job.provider_job_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ operation: "video-edits.upload", jobId: id, error: error instanceof Error ? error.message : "unknown" }));
    const message = error instanceof AuphonicError ? error.message : "The recording couldn't be sent for editing.";
    await failVideoEditJob(job, message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
