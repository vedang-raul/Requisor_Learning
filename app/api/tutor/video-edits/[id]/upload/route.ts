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
import { verifyUploadToken } from "@/lib/upload-token";

/**
 * Receives the tutor's recording for an auto-edit job and streams it straight
 * on to Auphonic, then starts the edit. Nothing is stored on this server.
 * The body is a multipart form with one file field, `input_file`.
 * (middleware.ts skips this route so the body isn't buffered in memory.)
 *
 * The tutor is identified by their login, or, when the site itself runs on a
 * host that can't take large uploads and sends them here instead, by a signed
 * upload token (lib/upload-token.ts). That second case is a cross-site
 * request, hence the CORS headers; it carries no cookies, so allowing any
 * origin is safe: the token is the only thing that grants access.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-upload-token, content-type",
  "Access-Control-Max-Age": "600",
};
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Who is uploading: the token's user if a token is sent, else the logged-in tutor. */
async function uploader(req: NextRequest, jobId: number): Promise<number | NextResponse> {
  const token = req.headers.get("x-upload-token");
  if (token) {
    const userId = verifyUploadToken(token, jobId);
    return userId ?? reply({ error: "This upload link has expired. Start the tidy-up again." }, 401);
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return reply({ error: "Unauthorized" }, 401);
  if (!canManage(session.user.role)) return reply({ error: "Forbidden" }, 403);
  const userId = Number(session.user.id);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : reply({ error: "Unauthorized" }, 401);
}
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const MAX_UPLOAD_BYTES = 4 * 1024 ** 3;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return reply({ error: "Job not found." }, 404);
  const userId = await uploader(req, id);
  if (userId instanceof NextResponse) return userId;

  const contentType = req.headers.get("content-type") ?? "";
  const contentLength = Number(req.headers.get("content-length"));
  if (!/^multipart\/form-data;\s*boundary=/i.test(contentType) || !req.body) {
    return reply({ error: "Send the recording as a file upload." }, 400);
  }
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) return reply({ error: "The recording is empty." }, 400);
  if (contentLength > MAX_UPLOAD_BYTES) return reply({ error: "Recordings can be up to 4 GB." }, 413);

  const { rows } = await db.query<VideoEditJobRow>("SELECT * FROM video_edit_jobs WHERE id = $1 AND owner_user_id = $2", [id, userId]);
  const job = rows[0];
  if (!job) return reply({ error: "Job not found." }, 404);
  if (job.provider !== "auphonic" || job.status !== "processing" || !job.provider_job_id) {
    return reply({ error: "This edit isn't waiting for a recording." }, 409);
  }

  try {
    await forwardUpload(job.provider_job_id, req.body, { contentType, contentLength });
    await startProduction(job.provider_job_id);
    return reply({ ok: true });
  } catch (error) {
    console.error(JSON.stringify({ operation: "video-edits.upload", jobId: id, error: error instanceof Error ? error.message : "unknown" }));
    const message = error instanceof AuphonicError ? error.message : "The recording couldn't be sent for editing.";
    await failVideoEditJob(job, message).catch(() => undefined);
    return reply({ error: message }, 502);
  }
}
