export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { canManageLesson, getLessonTranscript, saveLessonTranscript } from "@/lib/lesson-transcript";
import { cleanTranscript, TRANSCRIPT_MAX_CHARS } from "@/lib/transcript";
import { extractYouTubeId } from "@/lib/utils";
import { fetchOwnCaptions, getConnection, refreshAccessToken, YouTubeError, youtubeConfigured } from "@/lib/youtube";

/**
 * A lesson's video transcript, which the learner's assistant answers from.
 *   GET  ?lessonId=…            the saved transcript
 *   PUT  { lessonId, transcript } save (an empty transcript removes it)
 *   POST { videoId }            read the captions of a video on the tutor's own
 *                               YouTube channel; nothing is saved until PUT
 */
const MAX_REQUEST_BYTES = TRANSCRIPT_MAX_CHARS * 4 + 4096;
const LESSON_ID = /^[a-z0-9-]{3,120}$/i;
const fetchLimiter = createRateLimiter(10, 60_000);

async function tutor() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const role = session.user.role;
  const userId = Number(session.user.id);
  if ((role !== "admin" && role !== "tutor") || !Number.isSafeInteger(userId)) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { userId, isAdmin: role === "admin" } as const;
}

async function jsonBody(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await readJsonBody(req, MAX_REQUEST_BYTES);
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "That transcript is too long." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
}

export async function GET(req: Request) {
  const who = await tutor();
  if ("error" in who) return who.error;
  const lessonId = new URL(req.url).searchParams.get("lessonId") ?? "";
  if (!LESSON_ID.test(lessonId) || !(await canManageLesson(lessonId, who.userId, who.isAdmin))) {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }
  const saved = await getLessonTranscript(lessonId);
  return Response.json({ transcript: saved?.transcript ?? "", source: saved?.source ?? null });
}

export async function PUT(req: Request) {
  const who = await tutor();
  if ("error" in who) return who.error;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;
  const lessonId = typeof body.lessonId === "string" ? body.lessonId : "";
  if (!LESSON_ID.test(lessonId) || !(await canManageLesson(lessonId, who.userId, who.isAdmin))) {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }
  const transcript = cleanTranscript(body.transcript);
  await saveLessonTranscript(lessonId, transcript, body.source === "youtube" ? "youtube" : "manual", who.userId);
  return Response.json({ transcript });
}

const PASTE_HINT = "Open the video on YouTube, choose “Show transcript” under the description, and paste the text here.";

export async function POST(req: Request) {
  const who = await tutor();
  if ("error" in who) return who.error;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;
  const videoId = typeof body.videoId === "string" ? extractYouTubeId(body.videoId) : null;
  if (!videoId) return Response.json({ error: "Add the lesson's YouTube link first." }, { status: 400 });

  const { limited, retryAfterMs } = fetchLimiter.check(String(who.userId));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  const connection = youtubeConfigured() ? await getConnection(who.userId) : null;
  if (!connection) {
    return Response.json({ error: `YouTube only shares captions with the channel that owns the video, and no channel is connected. ${PASTE_HINT}` }, { status: 409 });
  }
  try {
    const accessToken = await refreshAccessToken(connection.refreshToken);
    const transcript = cleanTranscript(await fetchOwnCaptions(accessToken, videoId));
    if (!transcript) return Response.json({ error: `This video has no captions yet. ${PASTE_HINT}` }, { status: 404 });
    return Response.json({ transcript });
  } catch (error) {
    if (error instanceof YouTubeError) {
      const notYours = error.status === 403 || error.status === 404;
      return Response.json(
        { error: notYours ? `YouTube only shares captions for videos on your own connected channel. ${PASTE_HINT}` : `${error.message} ${PASTE_HINT}` },
        { status: notYours ? 403 : 502 }
      );
    }
    throw error;
  }
}
