export const runtime = "nodejs";
export const maxDuration = 60;

import { getServerSession } from "next-auth/next";
import { xaiFetch } from "@/lib/ai/usage";
import { authOptions } from "@/lib/auth/auth";
import { withAiConcurrency, SemaphoreFullError, AI_UPSTREAM_TIMEOUT_MS } from "@/lib/ai/ai-semaphore";
import { lessonAiHasSubject, lessonAiPrompt, readLessonAiContext, readLessonAiFields, readLessonAiValues } from "@/lib/ai/lesson-ai";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";

/**
 * Writes fields of a lesson for the tutor's lesson editor.
 *   POST { fields: ["title", "description", …], context: { the form so far } }
 *   →    { values: { title?, description?, durationMin?, section?, body?, assignment?, guardrails?, takeaways? } }
 * Nothing is saved: the values go into the form for the tutor to review.
 */
const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const MAX_REQUEST_BYTES = 48 * 1024;
const lessonAiLimiter = createRateLimiter(15, 60_000);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "tutor") return Response.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await readJsonBody(req, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "That is too much text for the AI to work from. Shorten it and try again." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fields = readLessonAiFields(body.fields);
  if (!fields.length) return Response.json({ error: "Nothing to write." }, { status: 400 });
  const context = readLessonAiContext(body.context);
  if (!lessonAiHasSubject(context)) {
    return Response.json({ error: "Tell the AI what the lesson is about first: type a title, or a few words in the note box." }, { status: 400 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI writing isn't set up on this server." }, { status: 503 });
  const { limited, retryAfterMs } = lessonAiLimiter.check(String(session.user.id));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  try {
    const parsed = await withAiConcurrency(async () => {
      const aborter = new AbortController();
      const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
      try {
        const res = await xaiFetch({ userId: session.user.id, feature: "lesson_ai" }, `${BASE_URL}/chat/completions`, {
          method: "POST",
          signal: aborter.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: fields.includes("body") ? 2600 : 1200,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: lessonAiPrompt(fields, context) }],
          }),
        });
        if (!res.ok) throw new Error(`upstream ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content ?? "";
        return JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as unknown;
      } finally {
        clearTimeout(timeoutId);
      }
    });
    const values = readLessonAiValues(fields, parsed);
    if (!Object.keys(values).length) return Response.json({ error: "The AI's answer couldn't be used. Try again." }, { status: 502 });
    return Response.json({ values });
  } catch (error) {
    if (error instanceof SemaphoreFullError) return Response.json({ error: "The AI is busy. Try again in a moment." }, { status: 503 });
    console.error("[lesson-ai] generation failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Couldn't write that right now. Try again." }, { status: 502 });
  }
}
