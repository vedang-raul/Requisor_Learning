export const runtime = "nodejs";
export const maxDuration = 300;

import { getServerSession } from "next-auth/next";
import { recordUnits, xaiFetch } from "@/lib/ai/usage";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { withAiConcurrency, SemaphoreFullError, AI_UPSTREAM_TIMEOUT_MS } from "@/lib/ai/ai-semaphore";
import {
  AiVideoError, aiVideoBriefReady, aiVideoScriptPrompt, cleanVideoScript, createPresenterVideo, getPresenterVideo, heygenConfigured,
  isProviderId, listPresenters, listVoices, presenterLook, readAiVideoBrief, SCRIPT_MIN_CHARS, VIDEO_BACKGROUNDS, VOICE_LANGUAGES,
  type VideoPresenter, type VideoVoice,
} from "@/lib/video/ai-video";
import { briefForReview, readVideoSafetyVerdict, screenVideoText, videoSafetyMessage, videoSafetyPrompt, type VideoSafetyVerdict } from "@/lib/video/video-safety";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { getConnection, refreshAccessToken, uploadVideo, videoDelivery, YouTubeError, youtubeConfigured } from "@/lib/video/youtube";

/**
 * AI-generated lesson videos for the tutor's lesson editor.
 *   GET                       whether it is set up, the presenters and voice languages to choose from, and the tutor's recent videos
 *   GET  ?voices=<language>   the voices for one language
 *   GET  ?id=…                one video's progress (asks the video service while it is still rendering)
 *   POST { action: "script", brief }                                   → { script }   a draft script from the brief
 *   POST { action: "create", title, script, presenterId, voiceId?, background } → { job }  starts the render
 *   POST { action: "youtube", id }                                     → { videoId }  posts a finished video to the tutor's channel
 */
const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const MAX_REQUEST_BYTES = 32 * 1024;
const scriptLimiter = createRateLimiter(10, 60_000, "ai:tutor:video-script");
// Rendering costs video-service credits: a handful an hour is plenty for writing lessons.
const renderLimiter = createRateLimiter(6, 60 * 60_000, "ai:tutor:video-render");
const publishLimiter = createRateLimiter(10, 24 * 60 * 60_000, "ai:tutor:video-publish");

type JobRow = {
  id: number; owner_user_id: number; provider_video_id: string; title: string; script: string; status: string;
  video_url: string | null; thumbnail_url: string | null; duration_sec: number | null; error: string | null;
  youtube_video_id: string | null; created_at: Date; updated_at: Date;
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
const CACHE_MS = 15 * 60_000;
// The presenter list takes a couple of dozen requests to put together, so it is kept for longer.
const PRESENTER_CACHE_MS = 6 * 60 * 60_000;
let presenterCache: { at: number; presenters: VideoPresenter[] } | null = null;
async function loadPresenters() {
  if (presenterCache && Date.now() - presenterCache.at < PRESENTER_CACHE_MS) return presenterCache.presenters;
  const presenters = await listPresenters();
  presenterCache = { at: Date.now(), presenters };
  return presenters;
}
const voiceCache = new Map<string, { at: number; voices: VideoVoice[] }>();
async function loadVoices(language: string) {
  const cached = voiceCache.get(language);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.voices;
  const voices = await listVoices(language);
  voiceCache.set(language, { at: Date.now(), voices });
  return voices;
}

/** Asks the video service about a render that is still in progress and records the answer. */
async function refresh(row: JobRow): Promise<JobRow> {
  // A finished video's links are signed and expire, so they are renewed when they are an hour old.
  const linksAreOld = row.status === "ready" && Date.now() - new Date(row.updated_at).getTime() > 60 * 60_000;
  if (row.status !== "processing" && !linksAreOld) return row;
  const now = await getPresenterVideo(row.provider_video_id);
  if (now.status === "processing") return row;
  // A finished video stays finished even if the service can no longer find its file.
  if (linksAreOld && now.status !== "ready") return row;
  const { rows } = await db.query<JobRow>(
    `UPDATE ai_video_jobs SET status = $2, video_url = $3, thumbnail_url = $4, duration_sec = $5, error = $6, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [row.id, now.status, now.videoUrl ?? null, now.thumbnailUrl ?? null, now.durationSec ?? null, now.error ?? null]
  );
  if (row.status === "processing" && now.status === "ready") recordUnits({ userId: row.owner_user_id, feature: "video_render" }, "heygen", Math.ceil(now.durationSec ?? 0), "seconds");
  return rows[0] ?? row;
}

/**
 * Checks a brief or script against the content rules (see src/lib/video/video-safety.ts).
 * Returns null when it may go ahead, or the response refusing it. When the AI
 * review can't give a verdict, `strict` decides: a render is refused (it is
 * published and paid for), while writing a draft goes ahead, because the
 * finished script is checked again before it is rendered.
 */
async function checkVideoContent(kind: "brief" | "script", text: string, userId: number, strict: boolean): Promise<Response | null> {
  const refuse = (category: Parameters<typeof videoSafetyMessage>[0], how: string) => {
    // Who and why, never the text itself.
    console.warn(`[ai-video] ${kind} refused for user ${userId}: ${category} (${how})`);
    return Response.json({ error: videoSafetyMessage(category), code: "content_policy", category }, { status: 422 });
  };
  const screened = screenVideoText(text);
  if (screened) return refuse(screened, "screen");

  const unchecked = () => strict
    ? Response.json({ error: "The video's content couldn't be checked just now, so it wasn't made. Try again in a moment." }, { status: 503 })
    : null;
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return unchecked();
  let verdict: VideoSafetyVerdict | null = null;
  try {
    verdict = await withAiConcurrency(async () => {
      const aborter = new AbortController();
      const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
      try {
        const res = await xaiFetch({ userId, feature: "video_check" }, `${BASE_URL}/chat/completions`, {
          method: "POST", signal: aborter.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: MODEL, max_tokens: 600, temperature: 0, response_format: { type: "json_object" },
            messages: [{ role: "user", content: videoSafetyPrompt(kind, text) }],
          }),
        });
        if (!res.ok) throw new Error(`upstream ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        return readVideoSafetyVerdict(data.choices?.[0]?.message?.content);
      } finally {
        clearTimeout(timeoutId);
      }
    });
  } catch (error) {
    console.error("[ai-video] content check failed", error instanceof Error ? error.message : "unknown");
  }
  if (!verdict) return unchecked();
  return verdict.allowed ? null : refuse(verdict.category, "review");
}

const failure = (error: unknown, fallback: string): Response => {
  if (error instanceof AiVideoError) return Response.json({ error: error.message }, { status: error.status && error.status >= 400 && error.status < 600 ? (error.status === 401 || error.status === 403 ? 502 : error.status) : 502 });
  console.error("[ai-video]", error instanceof Error ? error.message : "unknown");
  return Response.json({ error: fallback }, { status: 502 });
};

export async function GET(req: Request) {
  const who = await tutor();
  if (who instanceof Response) return who;
  const params = new URL(req.url).searchParams;
  const id = Number(params.get("id"));

  const wantedLanguage = params.get("voices");
  if (wantedLanguage !== null) {
    if (!heygenConfigured()) return Response.json({ voices: [] });
    const language = VOICE_LANGUAGES.find((l) => l === wantedLanguage) ?? VOICE_LANGUAGES[0];
    try {
      return Response.json({ language, voices: await loadVoices(language) });
    } catch (error) {
      return failure(error, "Couldn't load the voices.");
    }
  }

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
  const languages = [...VOICE_LANGUAGES];
  if (!heygenConfigured()) return Response.json({ configured: false, presenters: [], languages, youtube, jobs });
  try {
    return Response.json({ configured: true, presenters: await loadPresenters(), languages, youtube, jobs });
  } catch (error) {
    const message = error instanceof AiVideoError ? error.message : "Couldn't load the presenters.";
    return Response.json({ configured: true, presenters: [], languages, youtube, jobs, error: message });
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
    const { limited, retryAfterMs } = await scriptLimiter.check(String(who.userId));
    if (limited) return rateLimitResponse(retryAfterMs, { json: true });
    const refused = await checkVideoContent("brief", briefForReview(brief), who.userId, false);
    if (refused) return refused;
    try {
      const text = await withAiConcurrency(async () => {
        const aborter = new AbortController();
        const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
        try {
          const res = await xaiFetch({ userId: who.userId, feature: "video_script" }, `${BASE_URL}/chat/completions`, {
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
    if (!isProviderId(body.presenterId)) return Response.json({ error: "Choose a presenter." }, { status: 400 });
    // No voice chosen means the presenter's own voice.
    const voiceId = isProviderId(body.voiceId) ? body.voiceId : null;
    const background = VIDEO_BACKGROUNDS.find((b) => b.key === body.background)?.value ?? VIDEO_BACKGROUNDS[0].value;
    const title = (typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 100) : "") || "Lesson video";
    const { limited, retryAfterMs } = await renderLimiter.check(String(who.userId));
    if (limited) return rateLimitResponse(retryAfterMs, { json: true });
    // The final words are checked, whoever wrote them, before anything is paid for or published.
    const refused = await checkVideoContent("script", `Title: ${title}\n\n${script}`, who.userId, true);
    if (refused) return refused;
    try {
      const { lookId, engine } = await presenterLook(body.presenterId);
      const providerId = await createPresenterVideo({ title, script, lookId, engine, voiceId, background });
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
    const { limited, retryAfterMs } = await publishLimiter.check(String(who.userId));
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
