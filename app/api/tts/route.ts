export const runtime = "nodejs";
export const maxDuration = 30;

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { speechText, ttsCharacters, ttsConfigured, ttsModel, ttsVoiceId } from "@/lib/tts";

/**
 * Speaks the assistant's replies with an ElevenLabs voice.
 *   GET   { enabled, voices }  whether a voice is set up, and the characters to pick from
 *   POST  { text, voice? }     the reply as MP3 audio, in that character's voice
 * Signed-in users only, and rate limited, because every character is billed.
 */
const MAX_REQUEST_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;
// A reply is spoken in a few passages, each its own request.
const speakLimiter = createRateLimiter(60, 60_000);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ enabled: false }, { status: 401 });
  const enabled = ttsConfigured();
  return Response.json({ enabled, voices: enabled ? ttsCharacters() : [] });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!ttsConfigured()) return Response.json({ error: "Voice isn't set up on this server." }, { status: 503 });

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const text = speechText((body as { text?: unknown } | null)?.text);
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });
  const voice = (body as { voice?: unknown } | null)?.voice;

  const { limited, retryAfterMs } = speakLimiter.check(String(session.user.id));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  let upstream: Response;
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ttsVoiceId(voice)}/stream?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: ttsModel(voice) }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ error: "The voice service didn't answer." }, { status: 504 });
  }
  if (!upstream.ok || !upstream.body) {
    // 401: bad key. 402/429: out of credits or too many requests. The browser falls back to its own voice.
    console.error(`[tts] ElevenLabs answered ${upstream.status}`);
    return Response.json({ error: "The voice service is unavailable right now." }, { status: 502 });
  }
  return new Response(upstream.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
