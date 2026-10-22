export const runtime = "nodejs";
export const maxDuration = 30;

import { getServerSession } from "next-auth/next";
import { recordUnits } from "@/lib/ai/usage";
import { authOptions } from "@/lib/auth/auth";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { audioUpload, cleanTranscript, STT_MAX_BYTES, sttConfigured, sttModel } from "@/lib/ai/stt";
import { readBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body";

/**
 * Turns a voice recording into text for the assistant's voice input.
 *   POST  the recording as the request body, with its audio Content-Type  ->  { text }
 * Signed-in users only, and rate limited, because every second of audio is billed.
 * The recording is passed to ElevenLabs and not stored.
 */
const UPSTREAM_TIMEOUT_MS = 25_000;
const listenLimiter = createRateLimiter(20, 60_000, "ai:stt");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sttConfigured()) return Response.json({ error: "Voice input isn't set up on this server." }, { status: 503 });

  const upload = audioUpload(req.headers.get("content-type"));
  if (!upload) return Response.json({ error: "That isn't a voice recording." }, { status: 415 });
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > STT_MAX_BYTES) return Response.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });

  const { limited, retryAfterMs } = await listenLimiter.check(String(session.user.id));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  let audio: ArrayBuffer;
  try {
    audio = await readBodyBytes(req, STT_MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });
    return Response.json({ error: "The recording didn't arrive. Try again." }, { status: 400 });
  }
  if (audio.byteLength > STT_MAX_BYTES) return Response.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });
  if (audio.byteLength < 1000) return Response.json({ text: "" });

  const form = new FormData();
  form.append("model_id", sttModel());
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([audio], { type: upload.type }), upload.name);

  let upstream: Response;
  try {
    upstream = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ error: "The transcription service didn't answer. Try again." }, { status: 504 });
  }
  if (!upstream.ok) {
    // 401: bad key. 402/429: out of credits or too many requests.
    console.error(`[stt] ElevenLabs answered ${upstream.status}`);
    return Response.json({ error: "Voice input is unavailable right now. You can type your message instead." }, { status: 502 });
  }
  const data = (await upstream.json().catch(() => null)) as { text?: unknown } | null;
  recordUnits({ userId: session.user.id, feature: "voice_input" }, "elevenlabs", 1, "recordings");
  return Response.json({ text: cleanTranscript(data?.text) }, { headers: { "Cache-Control": "no-store" } });
}
