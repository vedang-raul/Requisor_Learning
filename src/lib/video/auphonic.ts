/**
 * Auphonic (https://auphonic.com) does the real work behind "Auto-edit my
 * recording": it transcribes the speech (built-in Whisper), cuts silences out
 * of the video, and levels the audio to a standard loudness. One production
 * per recording; results are a video file plus a WebVTT subtitle file.
 *
 * Env: AUPHONIC_API_KEY (Account → API Key on auphonic.com). Optional:
 * AUPHONIC_SUBTITLES=on (speech recognition is a paid-plan feature, so it is
 * off by default and the free plan works; without it YouTube's automatic
 * captions cover subtitles), AUPHONIC_LANGUAGE (subtitle language, default
 * "en") and AUPHONIC_API_URL (only for pointing at a stand-in server in tests).
 * Server-side only — the key never reaches the browser.
 */

import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export class AuphonicError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "AuphonicError";
  }
}

export function auphonicConfigured(): boolean {
  return Boolean(process.env.AUPHONIC_API_KEY);
}

const apiBase = () => (process.env.AUPHONIC_API_URL || "https://auphonic.com/api").replace(/\/+$/, "");
const authHeader = () => ({ Authorization: `Bearer ${process.env.AUPHONIC_API_KEY}` });
/** Speech recognition isn't included in Auphonic's free plan, so it must be switched on. */
export const auphonicSubtitlesEnabled = () => (process.env.AUPHONIC_SUBTITLES ?? "").toLowerCase() === "on";
export const auphonicLanguage = () => (process.env.AUPHONIC_LANGUAGE || "en").toLowerCase();

/** Auphonic's production status codes (GET /api/info/production_status.json). */
export const AUPHONIC_STATUS = { ERROR: 2, DONE: 3, INCOMPLETE: 9, NOT_STARTED: 10 } as const;

export type AuphonicOutputFile = { format?: string; ending?: string; filename?: string; download_url?: string; size?: number };
type Level = [number, string] | undefined;
export type AuphonicProduction = {
  uuid: string;
  status: number;
  status_string?: string;
  error_message?: string;
  /** Length of the result, in seconds. */
  length?: number;
  output_files?: AuphonicOutputFile[];
  statistics?: { levels?: { input?: { loudness?: Level }; output?: { loudness?: Level } } };
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!auphonicConfigured()) throw new AuphonicError("Auphonic is not configured.");
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers: { ...authHeader(), ...(init?.headers ?? {}) } });
  const body = (await response.json().catch(() => null)) as { data?: T; error_message?: string } | null;
  if (!response.ok || !body?.data) {
    throw new AuphonicError(body?.error_message || `Auphonic request failed (${response.status}).`, response.status);
  }
  return body.data;
}

/** The fixed edit every recording gets — the tutor chooses nothing. */
export function productionSettings(title: string) {
  const subtitles = auphonicSubtitlesEnabled();
  return {
    metadata: { title },
    algorithms: {
      // Even out the audio: balance loud/quiet speech, then a standard level.
      leveler: true,
      normloudness: true,
      loudnesstarget: -16,
      // Cut silences and dead air out of the video itself.
      silence_cutter: true,
      cut_mode: "apply_cuts",
    },
    // Subtitles: Auphonic's built-in Whisper, timed to the edited video.
    ...(subtitles ? { speech_recognition: { language: auphonicLanguage() } } : {}),
    output_files: [{ format: "video" }, ...(subtitles ? [{ format: "subtitle", ending: "vtt" }] : [])],
  };
}

/** Creates an empty production and returns its uuid. The file is added next. */
export async function createProduction(title: string): Promise<string> {
  const data = await call<AuphonicProduction>("/productions.json", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(productionSettings(title)),
  });
  if (!data.uuid) throw new AuphonicError("Auphonic didn't return a production id.");
  return data.uuid;
}

export const startProduction = (uuid: string) =>
  call<AuphonicProduction>(`/production/${encodeURIComponent(uuid)}/start.json`, { method: "POST" });

export const getProduction = (uuid: string) => call<AuphonicProduction>(`/production/${encodeURIComponent(uuid)}.json`);

/**
 * Streams the browser's multipart upload (form field `input_file`) straight
 * through to the production, so the recording is never buffered or stored
 * here. The body is passed on untouched, which is why the caller hands over
 * the original Content-Type (with its boundary) and Content-Length.
 */
export function forwardUpload(
  uuid: string,
  body: ReadableStream<Uint8Array>,
  headers: { contentType: string; contentLength: number }
): Promise<void> {
  const url = new URL(`${apiBase()}/production/${encodeURIComponent(uuid)}/upload.json`);
  const transport = url.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      { method: "POST", headers: { ...authHeader(), "Content-Type": headers.contentType, "Content-Length": String(headers.contentLength) } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => { if (chunks.length < 64) chunks.push(chunk); });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          if (status >= 200 && status < 300) return resolve();
          let message = `Auphonic wouldn't accept the recording (${status}).`;
          try {
            message = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { error_message?: string }).error_message || message;
          } catch { /* keep the generic message */ }
          reject(new AuphonicError(message, status));
        });
      }
    );
    request.on("error", (error) => reject(new AuphonicError(`Couldn't reach Auphonic: ${error.message}`)));
    const source = Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>);
    source.on("error", (error) => request.destroy(error));
    source.pipe(request);
  });
}

/** Result files need the API key, and it must only ever be sent to Auphonic. */
export function isAuphonicUrl(url: string): boolean {
  try {
    return new URL(url).host === new URL(apiBase()).host;
  } catch {
    return false;
  }
}

export const auphonicFileHeaders = (): Record<string, string> => authHeader();

/** Fetches a result file (optionally a byte range of it). */
export function fetchOutput(url: string, init?: { range?: string | null; method?: "GET" | "HEAD" }): Promise<Response> {
  if (!isAuphonicUrl(url)) throw new AuphonicError("Unexpected result file location.");
  return fetch(url, { method: init?.method ?? "GET", headers: { ...authHeader(), ...(init?.range ? { Range: init.range } : {}) } });
}

export const videoOutput = (production: AuphonicProduction) =>
  production.output_files?.find((file) => file.download_url && file.format !== "subtitle" && file.ending !== "vtt") ?? null;
export const subtitleOutput = (production: AuphonicProduction) =>
  production.output_files?.find((file) => file.download_url && (file.format === "subtitle" || file.ending === "vtt")) ?? null;

/** Plain words for the tutor while a production is running. */
export function stageLabel(status: number): string {
  switch (status) {
    case 0: case 12: return "Receiving your recording";
    case 1: return "Waiting in the queue";
    case 14: return "Transcribing speech for the subtitles";
    case 4: case 7: return "Cutting long pauses and evening out the audio";
    case 5: case 8: return "Rendering the final video";
    case 6: return "Finishing up";
    default: return "Getting started";
  }
}
