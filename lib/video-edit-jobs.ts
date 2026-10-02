import { db } from "@/lib/db";
import {
  AUPHONIC_STATUS, auphonicFileHeaders, auphonicLanguage, fetchOutput, getProduction, isAuphonicUrl, stageLabel, subtitleOutput,
  videoOutput, type AuphonicProduction,
} from "@/lib/auphonic";
import { buildDemoEditResult, DEMO_EDIT_SECONDS, parseVtt, type VideoEditResult } from "@/lib/video-edit";

export type VideoEditJobStatus = "processing" | "ready" | "failed";

export type VideoEditJob = {
  id: number;
  title: string;
  fileName: string;
  status: VideoEditJobStatus;
  /** Simulated job: the result is sample data, not made from the recording. */
  demo: boolean;
  /** What the editing service is doing right now (real jobs, while processing). */
  stage: string | null;
  result: VideoEditResult | null;
  /** Set once the edited video was posted to the tutor's YouTube channel. */
  youtubeVideoId: string | null;
  error: string | null;
  createdAt: string;
};

export type VideoEditJobRow = {
  id: number; owner_user_id: number; title: string; file_name: string; source_seconds: number | null;
  /** Auphonic jobs: where the edited video is fetched from (needs the API key, so it is never sent to the browser). */
  storage_key: string | null; provider: string; provider_job_id: string | null; status: VideoEditJobStatus;
  result: VideoEditResult | null; youtube_video_id: string | null; error: string | null; created_at: string;
  /** Not a column: filled in by refreshVideoEditJob. */
  stage?: string | null;
};

export function toVideoEditJob(row: VideoEditJobRow): VideoEditJob {
  return {
    id: row.id, title: row.title, fileName: row.file_name, status: row.status, demo: row.provider === "demo", stage: row.stage ?? null,
    result: row.result, youtubeVideoId: row.youtube_video_id, error: row.error, createdAt: row.created_at,
  };
}

/** A recording that never arrived (tab closed mid-upload) is given up on after this long. */
const UPLOAD_ABANDONED_SECONDS = 3 * 60 * 60;

// Age is computed in the database: created_at has no time zone, so comparing
// it with the Node clock would be off by the server's UTC offset.
async function jobAgeSeconds(id: number): Promise<number> {
  const { rows } = await db.query<{ age: number }>(
    "SELECT EXTRACT(EPOCH FROM (NOW() - created_at))::float AS age FROM video_edit_jobs WHERE id = $1",
    [id]
  );
  return rows[0]?.age ?? 0;
}

export async function failVideoEditJob(row: VideoEditJobRow, error: string): Promise<VideoEditJobRow> {
  const message = error.slice(0, 500);
  await db.query("UPDATE video_edit_jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1", [row.id, message]);
  return { ...row, status: "failed", error: message };
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian", nl: "Dutch", ja: "Japanese",
};
const lufs = (level: [number, string] | undefined) =>
  Array.isArray(level) && Number.isFinite(level[0]) ? `${Math.round(level[0])} ${level[1] || "LUFS"}` : null;

/** Turns a finished Auphonic production into what the tutor sees. */
export async function buildAuphonicResult(row: VideoEditJobRow, production: AuphonicProduction): Promise<VideoEditResult> {
  let vtt = "";
  const subtitles = subtitleOutput(production);
  if (subtitles?.download_url) {
    // Subtitles are a bonus: the edited video is still usable without them.
    try {
      const response = await fetchOutput(subtitles.download_url);
      if (response.ok) vtt = (await response.text()).slice(0, 2_000_000);
    } catch { /* leave the subtitles empty */ }
  }
  const cues = parseVtt(vtt);
  const original = row.source_seconds;
  const edited = typeof production.length === "number" && production.length > 0 ? Math.round(production.length) : null;
  const language = auphonicLanguage();
  return {
    demo: false,
    originalSeconds: original,
    editedSeconds: edited,
    silencesRemoved: null, // Auphonic reports the time saved, not a count
    secondsRemoved: original != null && edited != null ? Math.max(0, original - edited) : null,
    loudnessBefore: lufs(production.statistics?.levels?.input?.loudness),
    loudnessAfter: lufs(production.statistics?.levels?.output?.loudness),
    subtitleLanguage: LANGUAGE_NAMES[language] ?? language.toUpperCase(),
    subtitleCues: cues.length,
    wordCount: cues.reduce((total, cue) => total + cue.text.split(/\s+/).filter(Boolean).length, 0),
    subtitlePreview: cues.slice(0, 8),
    vtt,
    downloadUrl: `/api/tutor/video-edits/${row.id}/download/`,
  };
}

async function refreshAuphonicJob(row: VideoEditJobRow): Promise<VideoEditJobRow> {
  if (!row.provider_job_id) return failVideoEditJob(row, "This edit was never started. Please add the recording again.");
  let production: AuphonicProduction;
  try {
    production = await getProduction(row.provider_job_id);
  } catch (error) {
    // A blip talking to Auphonic shouldn't fail the job; the next poll retries.
    console.error(JSON.stringify({ operation: "video-edits.refresh", jobId: row.id, error: error instanceof Error ? error.message : "unknown" }));
    return row;
  }

  if (production.status === AUPHONIC_STATUS.ERROR) {
    return failVideoEditJob(row, production.error_message || "The editing service couldn't process this recording.");
  }
  if (production.status === AUPHONIC_STATUS.DONE) {
    const video = videoOutput(production);
    if (!video?.download_url) return failVideoEditJob(row, "The editing service finished but didn't return a video.");
    const result = await buildAuphonicResult(row, production);
    await db.query(
      "UPDATE video_edit_jobs SET status = 'ready', result = $2::jsonb, storage_key = $3, updated_at = NOW() WHERE id = $1",
      [row.id, JSON.stringify(result), video.download_url]
    );
    return { ...row, status: "ready", result, storage_key: video.download_url };
  }
  if (production.status === AUPHONIC_STATUS.INCOMPLETE || production.status === AUPHONIC_STATUS.NOT_STARTED) {
    if ((await jobAgeSeconds(row.id)) > UPLOAD_ABANDONED_SECONDS) {
      return failVideoEditJob(row, "The recording didn't finish uploading. Please add it again.");
    }
    return { ...row, stage: "Uploading your recording" };
  }
  return { ...row, stage: stageLabel(production.status) };
}

/** Brings a processing job up to date. Demo jobs finish after a fixed time. */
export async function refreshVideoEditJob(row: VideoEditJobRow): Promise<VideoEditJobRow> {
  if (row.status !== "processing") return row;
  if (row.provider === "auphonic") return refreshAuphonicJob(row);
  if (row.provider !== "demo") return row;

  if ((await jobAgeSeconds(row.id)) < DEMO_EDIT_SECONDS) return row;

  const result = buildDemoEditResult(row.title, row.source_seconds);
  await db.query(
    "UPDATE video_edit_jobs SET status = 'ready', result = $2::jsonb, updated_at = NOW() WHERE id = $1",
    [row.id, JSON.stringify(result)]
  );
  return { ...row, status: "ready", result };
}

/** Where the server reads a finished job's edited video from, with the auth to do so. */
export function editedVideoSource(row: VideoEditJobRow): { url: string; headers: Record<string, string> } | null {
  if (row.provider !== "auphonic" || row.status !== "ready" || !row.storage_key || !isAuphonicUrl(row.storage_key)) return null;
  return { url: row.storage_key, headers: auphonicFileHeaders() };
}
