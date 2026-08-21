import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ADMIN_EMAIL } from "@/lib/db";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { withAiConcurrency, SemaphoreFullError, AI_UPSTREAM_TIMEOUT_MS } from "@/lib/ai-semaphore";

export const runtime = "nodejs";

const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const XAI_API_BASE = "https://api.x.ai/v1";

// ── Per-user rate limiter ─────────────────────────────────────────────────────
// Team insights is admin-only; still rate-limited to prevent runaway queries.
const insightsLimiter = createRateLimiter(10, 60_000);

function buildSystemPrompt(): string {
  return [
    "You are an analytics assistant for an internal employee-learning admin panel (Requisor Learning).",
    "You'll be given a snapshot of course completion and an employee roster (demo/mock data). Write a short, skimmable summary for the admin/manager: a 1-2 sentence overview, then a short bulleted list of specific call-outs — who's falling behind and might need a nudge, who's excelling, which course is most/least popular — and end with one concrete suggested action.",
    "Be specific (name people, name courses) using only the data given. Never invent people or courses not listed. Keep the whole reply under 150 words.",
  ].join("\n");
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user?.email ||
    session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Per-user rate limit (admin email as key)
  const { limited, retryAfterMs } = insightsLimiter.check(session.user.email);
  if (limited) {
    return rateLimitResponse(retryAfterMs, { json: true });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The AI assistant isn't configured yet. Ask an admin to set XAI_API_KEY on the server." },
      { status: 503 }
    );
  }

  let body: { context?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.context || typeof body.context !== "string") {
    return Response.json({ error: "Missing context." }, { status: 400 });
  }

  try {
    const text = await withAiConcurrency(async () => {
      const aborter = new AbortController();
      const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
      try {
        const res = await fetch(`${XAI_API_BASE}/chat/completions`, {
          method: "POST",
          signal: aborter.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 500,
            messages: [
              { role: "system", content: buildSystemPrompt() },
              { role: "user", content: body.context },
            ],
          }),
        });

        if (!res.ok) throw new Error(`xAI API error: ${res.status}`);

        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? "";
      } finally {
        clearTimeout(timeoutId);
      }
    });

    return Response.json({ summary: text });
  } catch (err) {
    if (err instanceof SemaphoreFullError) {
      return Response.json(
        { error: "The insights service is busy due to high demand. Please try again in a moment." },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Couldn't generate insights right now. Please try again." },
      { status: 500 }
    );
  }
}
