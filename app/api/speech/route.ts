export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getSpeechCatalog, getSpeechLanguage, resolveSpeechContent } from "@/lib/speech-catalog";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { createRateLimiter } from "@/lib/rate-limit";
import { SpeechTranslationError, translateMarathiSpeech } from "@/lib/speech-translation";

const limiter = createRateLimiter(12, 60_000);
const active = new Set<string>();
const MAX_AUDIO_BYTES = 1024 * 1024;
const TIMEOUT_MS = 15_000;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function error(message: string, status: number, extra: Record<string, string> = {}) {
  return Response.json({ error: message }, { status, headers: { ...headers, ...extra } });
}
function sameOrigin(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (!origin) return false;
    const source = new URL(origin);
    const target = new URL(req.url);
    // TLS terminates at the proxy: Next's internal URL may be HTTP. Compare
    // the incoming Host, never an arbitrary client-supplied forwarded host.
    return source.origin === origin && source.host === (req.headers.get("host") ?? target.host)
      && (source.protocol === "https:" || (process.env.NODE_ENV !== "production" && source.protocol === "http:" && source.origin === target.origin));
  } catch { return false; }
}
async function authenticatedId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id || null;
}

/** Also acts as a local readiness check; never probes the provider with personal data. */
export async function GET() {
  if (!await authenticatedId()) return error("Sign in to use speech.", 401);
  const { voices, setupMessage } = getSpeechCatalog();
  return Response.json({ voices, setupMessage }, { headers });
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const uid = await authenticatedId();
  if (!uid) return error("Sign in to use speech.", 401);
  // Require an exact same-origin browser request. No CORS, no referer fallback.
  if (!sameOrigin(req)
    || (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin")) {
    return error("Speech requests must come from this application.", 403);
  }
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return error("Expected a JSON request.", 415);
  const limit = limiter.check(uid);
  if (limit.limited) return error("Too many speech requests. Try again shortly.", 429, { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) });
  let body: unknown;
  try {
    body = await readJsonBody(req, 4096);
  } catch (e) {
    return error("Invalid speech request.", e instanceof RequestBodyTooLargeError ? 413 : 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return error("Invalid speech request.", 400);
  const b = body as Record<string, unknown>;
  // Send either a fixed preview key or one bounded reply chunk, never history or metadata.
  const isReply = Object.prototype.hasOwnProperty.call(b, "text");
  if (Object.keys(b).length !== 2 || !Object.keys(b).every(k => k === "voiceKey" || k === (isReply ? "text" : "contentKey"))
    || typeof b.voiceKey !== "string"
    || (isReply
      ? typeof b.text !== "string" || !b.text.trim() || b.text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.text)
      : typeof b.contentKey !== "string" || !resolveSpeechContent(b.contentKey))) {
    return error("Provide an allowed voice and either a preview key or a reply of up to 1000 characters.", 400);
  }
  const catalog = getSpeechCatalog();
  const voice = catalog.configured.find(v => v.key === b.voiceKey);
  const publicVoice = catalog.voices.find(v => v.key === b.voiceKey);
  if (!voice) return error("Unapproved voice.", 400);
  if (!publicVoice?.enabled || !voice.voiceId || !process.env.ELEVENLABS_API_KEY) return error(publicVoice?.unavailableReason ?? "Speech is not configured.", 503);
  const language = getSpeechLanguage(voice.languages);
  const text = isReply ? b.text as string : language ? resolveSpeechContent(b.contentKey, language) : null;
  if (!text) return error("Approved speech is unavailable in this language.", 503);
  if (active.has(uid) || active.size >= 4) return error("Speech is busy. Stop playback or try again shortly.", 429, { "Retry-After": "2" });
  if (req.signal.aborted) return error("Speech cancelled.", 499);
  active.add(uid);
  const controller = new AbortController();
  let timedOut = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => {
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  };
  req.signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; cancel(); }, isReply && language === "mr" ? 60_000 : TIMEOUT_MS);
  let outcome = "provider_error";
  try {
    const spokenText = isReply && language === "mr"
      ? await translateMarathiSpeech(text, controller.signal)
      : text;
    if (controller.signal.aborted) throw new Error("cancelled");
    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      // Only narration text and model: no account metadata, history or credentials in the body.
      body: JSON.stringify({
        text: spokenText,
        model_id: language === "mr" ? "eleven_v3" : "eleven_multilingual_v2",
        ...(language === "mr" ? { language_code: "mr" } : {}),
      }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!upstream.ok || !upstream.body || upstream.headers.get("content-type")?.split(";")[0] !== "audio/mpeg") {
      await upstream.body?.cancel();
      return error("Speech provider is unavailable. Please try again.", 502);
    }
    reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      if (controller.signal.aborted) throw new Error("cancelled");
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) { cancel(); throw new Error("audio_limit"); }
      chunks.push(value);
    }
    if (controller.signal.aborted || size === 0) throw new Error("empty_or_cancelled");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    outcome = "success";
    return new Response(bytes, { headers: { ...headers, "Content-Type": "audio/mpeg" } });
  } catch (cause) {
    const translationFailed = cause instanceof SpeechTranslationError;
    outcome = timedOut ? "timeout" : req.signal.aborted ? "cancelled" : translationFailed ? "translation_error" : "provider_error";
    return error(timedOut ? "Speech took too long. Please try again." : req.signal.aborted ? "Speech cancelled." : translationFailed ? "Marathi speech translation is unavailable. Please try again." : "Speech could not be generated. Please try again.", timedOut ? 504 : req.signal.aborted ? 499 : 502);
  } finally {
    clearTimeout(timeout);
    req.signal.removeEventListener("abort", cancel);
    controller.abort();
    void reader?.cancel().catch(() => undefined);
    active.delete(uid);
    // Metadata only: no text, input fields, provider errors, credentials or user IDs.
    console.info(JSON.stringify({ operation: "speech", requestId, outcome, durationMs: Date.now() - started }));
  }
}
