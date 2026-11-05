export const runtime = "nodejs";
export const maxDuration = 60;

import { xaiFetch } from "@/lib/ai/usage";
import { AI_UPSTREAM_TIMEOUT_MS, SemaphoreFullError, withAiConcurrency } from "@/lib/ai/ai-semaphore";
import { requireAccess } from "@/lib/server/access";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { readAiTheme, themeAiPrompt } from "@/lib/theme/university-theme";

/**
 * A theme from a few words about the feel a university wants, for super admins.
 *   POST { description } → { theme, why, adjusted }
 * Nothing is saved: the theme goes into the editor to look at, change and save.
 * Whatever the AI sends is made readable first (adjusted: true when it had to be).
 */
const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const limiter = createRateLimiter(10, 60_000, "ai:admin:theme");

export async function POST(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  let description = "";
  try {
    const raw = (await readJsonBody(req, 4_096)) as { description?: unknown } | null;
    description = typeof raw?.description === "string" ? raw.description.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError || error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  if (description.length < 3) return Response.json({ error: "Say in a few words how it should feel, like \"warm red and brown, serious\"." }, { status: 400 });
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return Response.json({ error: "AI isn't set up on this server." }, { status: 503 });
  const { limited, retryAfterMs } = await limiter.check(String(who.userId));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  try {
    const parsed = await withAiConcurrency(async () => {
      const aborter = new AbortController();
      const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
      try {
        const res = await xaiFetch({ userId: who.userId, feature: "theme_ai" }, `${BASE_URL}/chat/completions`, {
          method: "POST", signal: aborter.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: MODEL, max_tokens: 400, response_format: { type: "json_object" }, messages: [{ role: "user", content: themeAiPrompt(description) }] }),
        });
        if (!res.ok) throw new Error(`upstream ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content ?? "";
        return JSON.parse(content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1)) as unknown;
      } finally {
        clearTimeout(timeoutId);
      }
    });
    const result = readAiTheme(parsed);
    if (!result) return Response.json({ error: "The AI's answer couldn't be used. Try again, or pick a style." }, { status: 502 });
    return Response.json(result);
  } catch (error) {
    if (error instanceof SemaphoreFullError) return Response.json({ error: "The AI is busy. Try again in a moment." }, { status: 503 });
    console.error("[theme-ai] failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Couldn't make a theme right now. Try again, or pick a style." }, { status: 502 });
  }
}
