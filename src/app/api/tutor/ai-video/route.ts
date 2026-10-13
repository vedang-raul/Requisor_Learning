export const runtime = "nodejs";
export const maxDuration = 300;

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { withAiConcurrency, SemaphoreFullError, AI_UPSTREAM_TIMEOUT_MS } from "@/lib/ai/ai-semaphore";
import {
  AiVideoError, aiVideoBriefReady, aiVideoScriptPrompt, cleanVideoScript, createPresenterVideo, getPresenterVideo, heygenConfigured,
  isProviderId, listPresenters, listVoices, readAiVideoBrief, SCRIPT_MIN_CHARS, splitScriptIntoScenes, VIDEO_BACKGROUNDS,
  type VideoPresenter, type VideoVoice,
} from "@/lib/video/ai-video";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { getConnection, refreshAccessToken, uploadVideo, videoDelivery, YouTubeError, youtubeConfigured } from "@/lib/video/youtube";

/**
 * AI-generated lesson videos for the tutor's lesson editor.
 *   GET                       whether it is set up, the presenters and voices to choose from, and the tutor's recent videos
 *   GET  ?id=…                one video's progress (asks the video service while it is still rendering)
 *   POST { action: "script", brief }                                   → { script }   a draft script from the brief
 *   POST { action: "create", title, script, avatarId, voiceId, background } → { job }  starts the render
 *   POST { action: "youtube", id }                                     → { videoId }  posts a finished video to the tutor's channel
 */
const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const MAX_REQUEST_BYTES = 32 * 1024;
const scriptLimiter = createRateLimiter(10, 60_000);
// Rendering costs video-service credits: a handful an hour is plenty for writing lessons.
const renderLimiter = createRateLimiter(6, 60 * 60_000);
const publishLimiter = createRateLimiter(10, 24 * 60 * 60_000);

type JobRow = {
  id: number; owner_user_id: number; provider_video_id: string; title: string; script: string; status: string;
  video_url: string | null; thumbnail_url: string | null; duration_sec: number | null; error: string | null;
  youtube_video_id: string | null; created_at: Date;
};
const publicJob = (row: JobRow) => ({
  id: row.id, title: row.title, script: row.script, status: row.status as "processing" | "ready" | "failed",
  videoUrl: row.video_url, thumbnailUrl: row.thumbnail_url, durationSec: row.duration_sec, error: row.error,
  youtubeVideoId: row.youtube_video_id, createdAt: new Date(row.created_at).toISOString(),
});

async function tutor(): Promise<{ userId: number } | Response> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "tutor") return Response.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return { userId };
}

// The presenter and voice lists are the same for everyone and change rarely.
let catalog: { at: number; presenters: VideoPresenter[]; voices: VideoVoice[] } | null = null;
async function loadCatalog() {
  if (catalog && Date.now() - catalog.at < 15 * 60_000) return catalog;
  const [presenters, voices] = await Promise.all([listPresenters(), listVoices()]);
  catalog = { at: Date.now(), presenters, voices };
  return catalog;
}

/** Asks the video service about a render that is still in progress and records the answer. */
async function refresh(row: JobRow): Promise<JobRow> {
  if (row.status !== "processing") return row;
  const now = await getPresenterVideo(row.provider_video_id);
  if (now.status === "processing") return row;
  const { rows } = await db.query<JobRow>(
    `UPDATE ai_video_jobs SET status = $2, video_url = $3, thumbnail_url = $4, duration_sec = $5, error = $6, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [row.id, now.status, now.videoUrl ?? null, now.thumbnailUrl ?? null, now.durationSec ?? null, now.error ?? null]
  );
  return rows[0] ?? row;
}

const failure = (error: unknown, fallback: string): Response => {
  if (error instanceof AiVideoError) return Response.json({ error: error.message }, { status: error.status && error.status >= 400 && error.status < 600 ? (error.status === 401 || error.status === 403 ? 502 : error.status) : 502 });
  console.error("[ai-video]", error instanceof Error ? error.message : "unknown");
  return Response.json({ error: fallback }, { status: 502 });
};

export async function GET(req: Request) {
  const who = await tutor();
  if (who instanceof Response) return who;
  const id = Number(new URL(req.url).searchParams.get("id"));

  if (Number.isSafeInteger(id) && id > 0) {
    const { rows } = await db.query<JobRow>("SELECT * FROM ai_video_jobs WHERE id = $1 AND owner_user_id = $2", [id, who.userId]);
    if (!rows[0]) return Response.json({ error: "Video not found." }, { status: 404 });
    try {
      return Response.json({ job: publicJob(await refresh(rows[0])) });
    } catch (error) {
      // A hiccup while asking about progress isn't a failed video: report it as still rendering.
      if (error instanceof AiVideoError && (error.status === 504 || error.status === 429)) return Response.json({ job: publicJob(rows[0]) });
      return failure(error, "Couldn't check on the video.");
    }
  }

  const connection = youtubeConfigured() ? await getConnection(who.userId).catch(() => null) : null;
  const youtube = { delivery: videoDelivery(), connected: Boolean(connection), channelTitle: connection?.channelTitle ?? null };
  const { rows: recent } = await db.query<JobRow>("SELECT * FROM ai_video_jobs WHERE owner_user_id = $1 ORDER BY id DESC LIMIT 6", [who.userId]);
  const jobs = recent.map(publicJob);
  if (!heygenConfigured()) return Response.json({ configured: false, presenters: [], voices: [], youtube, jobs });
  try {
    const { presenters, voices } = await loadCatalog();
    return Response.json({ configured: true, presenters, voices, youtube, jobs });
  } catch (error) {
    const message = error instanceof AiVideoError ? error.message : "Couldn't load the presenters.";
    return Response.json({ configured: true, presenters: [], voices: [], youtube, jobs, error: message });
  }
}

export async function POST(req: Request) {
  const who = await tutor();
  if (who instanceof Response) return who;
  let raw: unknown;
  try {
    raw = await readJsonBody(req, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "That is too much text. Shorten it and try again." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // ── A draft script from the brief ──
  if (body.action === "script") {
    const brief = readAiVideoBrief(body.brief);
    if (!aiVideoBriefReady(brief)) return Response.json({ error: "Say what the video should teach first." }, { status: 400 });
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return Response.json({ error: "AI writing isn't set up on this server." }, { status: 503 });
    const { limited, retryAfterMs } = scriptLimiter.check(String(who.userId));
    if (limited) return rateLimitResponse(retryAfterMs, { json: true });
    try {
      const text = await withAiConcurrency(async () => {
        const aborter = new AbortController();
        const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
        try {
          const res = await fetch(`${BASE_URL}/chat/completions`, {
            method: "POST", signal: aborter.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: MODEL, max_tokens: 1800, messages: [{ role: "user", content: aiVideoScriptPrompt(brief) }] }),
          });
          if (!res.ok) throw new Error(`upstream ${res.status}`);
          const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          return data.choices?.[0]?.message?.content ?? "";
        } finally {
          clearTimeout(timeoutId);
        }
      });
      const script = cleanVideoScript(text);
      if (script.length < SCRIPT_MIN_CHARS) return Response.json({ error: "The AI's script couldn't be used. Try again." }, { status: 502 });
      return Response.json({ script });
    } catch (error) {
      if (error instanceof SemaphoreFullError) return Response.json({ error: "The AI is busy. Try again in a moment." }, { status: 503 });
      console.error("[ai-video] script failed", error instanceof Error ? error.message : "unknown");
      return Response.json({ error: "Couldn't write the script right now. Try again." }, { status: 502 });
    }
  }

  // ── Start a render ──
  if (body.action === "create") {
    if (!heygenConfigured()) return Response.json({ error: "AI video isn't set up on this server." }, { status: 503 });
    const script = cleanVideoScript(body.script);
    if (script.length < SCRIPT_MIN_CHARS) return Response.json({ error: "Write a script first: a few sentences at least." }, { status: 400 });
    if (!isProviderId(body.avatarId) || !isProviderId(body.voiceId)) return Response.json({ error: "Choose a presenter and a voice." }, { status: 400 });
    const background = VIDEO_BACKGROUNDS.find((b) => b.key === body.background)?.value ?? VIDEO_BACKGROUNDS[0].value;
    const title = (typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 100) : "") || "Lesson video";
    const scenes = splitScriptIntoScenes(script);
    if (!scenes.length) return Response.json({ error: "Write a script first." }, { status: 400 });
    const { limited, retryAfterMs } = renderLimiter.check(String(who.userId));
    if (limited) return rateLimitResponse(retryAfterMs, { json: true });
    try {
      const providerId = await createPresenterVideo({ title, scenes, avatarId: body.avatarId, voiceId: body.voiceId, background });
      const { rows } = await db.query<JobRow>(
        `INSERT INTO ai_video_jobs (owner_user_id, provider, provider_video_id, title, script, status)
         VALUES ($1, 'heygen', $2, $3, $4, 'processing') RETURNING *`,
        [who.userId, providerId, title, script]
      );
      return Response.json({ job: publicJob(rows[0]) }, { status: 201 });
    } catch (error) {
      return failure(error, "Couldn't start the video. Try again.");
    }
  }

  // ── Post a finished video to the tutor's YouTube channel ──
  if (body.action === "youtube") {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Video not found." }, { status: 404 });
    if (videoDelivery() !== "youtube") return Response.json({ error: "Posting to YouTube isn't switched on. Download the video and upload it to YouTube yourself." }, { status: 409 });
    const { rows } = await db.query<JobRow>("SELECT * FROM ai_video_jobs WHERE id = $1 AND owner_user_id = $2", [id, who.userId]);
    const job = rows[0];
    if (!job) return Response.json({ error: "Video not found." }, { status: 404 });
    if (job.youtube_video_id) return Response.json({ videoId: job.youtube_video_id, alreadyPosted: true });
    if (job.status !== "ready" || !job.video_url) return Response.json({ error: "This video isn't finished yet." }, { status: 409 });
    const connection = await getConnection(who.userId);
    if (!connection) return Response.json({ error: "Connect your YouTube channel first.", code: "not_connected" }, { status: 409 });
    const { limited, retryAfterMs } = publishLimiter.check(String(who.userId));
    if (limited) return rateLimitResponse(retryAfterMs, { json: true });
    try {
      const accessToken = await refreshAccessToken(connection.refreshToken);
      const head = await fetch(job.video_url, { method: "HEAD" });
      const sizeBytes = Number(head.headers.get("content-length"));
      if (!head.ok || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) throw new YouTubeError("The video file is no longer available. Generate it again.");
      const videoId = await uploadVideo(
        accessToken,
        { url: job.video_url, sizeBytes, contentType: head.headers.get("content-type") || "video/mp4" },
        { title: job.title, description: "Lesson video — Alma 41.", privacyStatus: "unlisted" }
      );
      await db.query("UPDATE ai_video_jobs SET youtube_video_id = $2, updated_at = NOW() WHERE id = $1", [id, videoId]);
      return Response.json({ videoId });
    } catch (error) {
      console.error("[ai-video] youtube failed", error instanceof Error ? error.message : "unknown");
      const message = error instanceof YouTubeError ? error.message : "Couldn't post the video to YouTube.";
      return Response.json({ error: `${message} You can still download it and upload it yourself.` }, { status: 502 });
    }
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
}
