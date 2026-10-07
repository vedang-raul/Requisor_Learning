/**
 * Posting edited lesson videos to a tutor's own YouTube channel (optional
 * delivery mode — see VideoDelivery in lib/video-edit.ts). OFF by default:
 * it activates only with VIDEO_DELIVERY=youtube and Google OAuth credentials
 * (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET, falling back to the Google
 * sign-in client). Server-side only.
 *
 * Follows Google's documented flows:
 *  - OAuth 2.0 web-server flow with offline access (a refresh token per tutor)
 *  - resumable upload: POST …/upload/youtube/v3/videos?uploadType=resumable
 *    → session URI in the Location header → PUT the bytes → 201 + video id
 *  - captions.insert (multipart) for the subtitle track
 *
 * Things Google imposes that the product must live with:
 *  - Uploads from an API project that hasn't passed YouTube's audit are locked
 *    to PRIVATE, and private videos can't be embedded in lessons.
 *  - videos.insert is limited to 100 calls per day per project; captions.insert
 *    costs 400 quota units.
 */

import crypto from "crypto";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/base-url";
import type { VideoDelivery } from "@/lib/video-edit";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";
/** upload: post videos. force-ssl: add caption tracks and read the channel name. */
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"];
const STATE_TTL_MS = 10 * 60_000;

export class YouTubeError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "YouTubeError";
  }
}

const clientId = () => process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = () => process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
const appSecret = () => process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET || "";

export function youtubeConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && appSecret());
}

/** How finished videos reach learners right now. */
export function videoDelivery(): VideoDelivery {
  return (process.env.VIDEO_DELIVERY ?? "").toLowerCase() === "youtube" && youtubeConfigured() ? "youtube" : "download";
}

export function youtubeRedirectUri(): string {
  return `${getBaseUrl()}/api/tutor/youtube/callback/`;
}

// ── OAuth state: binds the Google round-trip to the tutor who started it ─────
function sign(payload: string): string {
  return crypto.createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

export function createOAuthState(userId: number): string {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}.${crypto.randomBytes(8).toString("hex")}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the user id the state was issued for, or null if forged/expired. */
export function verifyOAuthState(state: string): number | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const payload = parts.slice(0, 3).join(".");
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(parts[3]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const userId = Number(parts[0]);
  if (!Number.isSafeInteger(userId) || userId < 1 || Number(parts[1]) < Date.now()) return null;
  return userId;
}

export function buildAuthUrl(userId: number): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // ask for a refresh token
    prompt: "consent", // …and make sure Google actually returns one
    include_granted_scopes: "true",
    state: createOAuthState(userId),
  });
  return `${AUTH_URL}?${params}`;
}

// ── Tokens ──────────────────────────────────────────────────────────────────
async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string };
  if (!res.ok || !data.access_token) throw new YouTubeError(`Google sign-in failed (${data.error ?? res.status}).`, res.status);
  return { access_token: data.access_token, refresh_token: data.refresh_token };
}

export const exchangeCode = (code: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: youtubeRedirectUri() });

export const refreshAccessToken = async (refreshToken: string) =>
  (await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken })).access_token;

// ── Refresh-token storage (AES-256-GCM, key derived from the app secret) ────
const key = () => crypto.createHash("sha256").update(`youtube-token:${appSecret()}`).digest();

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptToken(stored: string): string {
  const [iv, tag, data] = stored.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export type YouTubeConnection = { channelId: string | null; channelTitle: string | null };

export async function getConnection(userId: number): Promise<(YouTubeConnection & { refreshToken: string }) | null> {
  const { rows } = await db.query<{ channel_id: string | null; channel_title: string | null; refresh_token_enc: string }>(
    "SELECT channel_id, channel_title, refresh_token_enc FROM youtube_connections WHERE user_id = $1",
    [userId]
  );
  if (!rows[0]) return null;
  return { channelId: rows[0].channel_id, channelTitle: rows[0].channel_title, refreshToken: decryptToken(rows[0].refresh_token_enc) };
}

export async function saveConnection(userId: number, refreshToken: string, channel: YouTubeConnection): Promise<void> {
  await db.query(
    `INSERT INTO youtube_connections (user_id, channel_id, channel_title, refresh_token_enc, connected_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET channel_id = EXCLUDED.channel_id, channel_title = EXCLUDED.channel_title,
       refresh_token_enc = EXCLUDED.refresh_token_enc, connected_at = NOW()`,
    [userId, channel.channelId, channel.channelTitle, encryptToken(refreshToken)]
  );
}

export async function deleteConnection(userId: number): Promise<void> {
  await db.query("DELETE FROM youtube_connections WHERE user_id = $1", [userId]);
}

// ── API calls ───────────────────────────────────────────────────────────────
export async function fetchOwnChannel(accessToken: string): Promise<YouTubeConnection> {
  const res = await fetch(`${API}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => ({}))) as { items?: { id?: string; snippet?: { title?: string } }[] };
  const channel = res.ok ? data.items?.[0] : undefined;
  return { channelId: channel?.id ?? null, channelTitle: channel?.snippet?.title?.slice(0, 200) ?? null };
}

export type UploadSource = { url: string; sizeBytes: number; contentType: string; /** Sent when reading the file, e.g. the editing service's auth. */ headers?: Record<string, string> };

/**
 * Uploads a video with the resumable protocol, streaming it from `source.url`
 * (a signed bucket URL) so the file never sits in this server's memory.
 * Returns the new YouTube video id.
 */
export async function uploadVideo(
  accessToken: string,
  source: UploadSource,
  meta: { title: string; description: string; privacyStatus: "private" | "unlisted" | "public" }
): Promise<string> {
  const start = await fetch(`${UPLOAD_API}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(source.sizeBytes),
      "X-Upload-Content-Type": source.contentType,
    },
    body: JSON.stringify({
      snippet: { title: meta.title.slice(0, 100), description: meta.description.slice(0, 5000), categoryId: "27" /* Education */ },
      status: { privacyStatus: meta.privacyStatus, selfDeclaredMadeForKids: false },
    }),
  });
  const session = start.headers.get("location");
  if (!start.ok || !session) throw new YouTubeError(`YouTube wouldn't start the upload (${start.status}).`, start.status);

  const file = await fetch(source.url, source.headers ? { headers: source.headers } : undefined);
  if (!file.ok || !file.body) throw new YouTubeError("Couldn't read the edited video to upload it.");

  const put = await fetch(session, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Length": String(source.sizeBytes), "Content-Type": source.contentType },
    body: file.body,
    // Required by Node's fetch when the request body is a stream.
    duplex: "half",
  } as RequestInit);
  const data = (await put.json().catch(() => ({}))) as { id?: string };
  if (put.status !== 201 && put.status !== 200 || !data.id) throw new YouTubeError(`YouTube upload failed (${put.status}).`, put.status);
  return data.id;
}

/**
 * Reads a video's captions as WebVTT. YouTube only allows this for videos on
 * the signed-in channel (403 otherwise). Prefers captions someone wrote over
 * automatic ones, and English over other languages. Returns "" when the video
 * has no caption track.
 */
export async function fetchOwnCaptions(accessToken: string, videoId: string): Promise<string> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const list = await fetch(`${API}/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`, { headers });
  if (!list.ok) throw new YouTubeError(`YouTube wouldn't list this video's captions (${list.status}).`, list.status);
  const data = (await list.json()) as { items?: { id: string; snippet?: { language?: string; trackKind?: string } }[] };
  const tracks = data.items ?? [];
  if (!tracks.length) return "";
  const rank = (track: (typeof tracks)[number]) =>
    (track.snippet?.trackKind === "asr" ? 0 : 2) + (track.snippet?.language?.toLowerCase().startsWith("en") ? 1 : 0);
  const best = [...tracks].sort((a, b) => rank(b) - rank(a))[0];
  const res = await fetch(`${API}/captions/${encodeURIComponent(best.id)}?tfmt=vtt`, { headers });
  if (!res.ok) throw new YouTubeError(`YouTube wouldn't share this video's captions (${res.status}).`, res.status);
  return res.text();
}

/** Adds a subtitle track (WebVTT) to an uploaded video via captions.insert. */
export async function uploadCaptions(accessToken: string, videoId: string, vtt: string, language = "en"): Promise<void> {
  const boundary = `requisor-${crypto.randomBytes(8).toString("hex")}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ snippet: { videoId, language, name: "Subtitles", isDraft: false } }),
    `--${boundary}`,
    "Content-Type: application/octet-stream",
    "",
    vtt,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await fetch(`${UPLOAD_API}/captions?uploadType=multipart&part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new YouTubeError(`YouTube wouldn't accept the subtitles (${res.status}).`, res.status);
}
