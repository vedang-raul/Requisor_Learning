export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { withAiConcurrency, SemaphoreFullError, AI_UPSTREAM_TIMEOUT_MS } from "@/lib/ai-semaphore";

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

// ── Per-user rate limiter ─────────────────────────────────────────────────────
// Assignment generation: 10 per user per minute.
const assignmentLimiter = createRateLimiter(10, 60_000);

function buildPersonaLine(qualification: string | null, learningGoal: string | null, ageYears: number | null): string {
  const parts: string[] = [];
  if (qualification) parts.push(`background: ${qualification}`);
  if (ageYears) parts.push(`age: ${ageYears} years old`);
  if (learningGoal) parts.push(`learning goal: ${learningGoal}`);
  if (!parts.length) return "";
  return `The learner has the following profile — ${parts.join(", ")}.`;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user rate limit
  const { limited, retryAfterMs } = assignmentLimiter.check(session.user.email);
  if (limited) {
    return rateLimitResponse(retryAfterMs, { json: true });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Assignment generation not configured." }, { status: 503 });
  }

  let body: {
    lessonTitle?: string;
    description?: string;
    keyTakeaways?: string[];
    assignment?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { lessonTitle, description, keyTakeaways, assignment } = body;
  if (!lessonTitle || typeof lessonTitle !== "string") {
    return Response.json({ error: "Missing lessonTitle." }, { status: 400 });
  }

  // Load profile from DB — never trust caller-supplied profile values
  const { rows } = await db.query<DbUser>(
    "SELECT date_of_birth, qualification, learning_goal FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = rows[0];
  const dob = user?.date_of_birth ? new Date(user.date_of_birth) : null;
  const ageYears = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
  const personaLine = buildPersonaLine(user?.qualification ?? null, user?.learning_goal ?? null, ageYears);

  const prompt = [
    `You are generating a personalised practical assignment for a learner after they watch a lesson.`,
    personaLine
      ? `${personaLine} Adapt the assignment's framing, examples, and complexity to their background and goal.`
      : "",
    ``,
    `Lesson title: ${lessonTitle}`,
    description ? `Lesson description: ${description}` : "",
    keyTakeaways?.length ? `Key takeaways: ${keyTakeaways.join("; ")}` : "",
    assignment ? `Original assignment (use as a base, but personalise it): ${assignment}` : "",
    ``,
    `Write a single practical assignment instruction in 2-4 sentences. Be specific, actionable, and relevant to the learner's context.`,
    `Do NOT include a title, heading, bullet points, or any markdown. Just return the plain assignment text.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const text = await withAiConcurrency(async () => {
      const aborter = new AbortController();
      const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
      try {
        const res = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          signal: aborter.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
        });

        if (!res.ok) {
          console.error("[assignment] xAI API error:", res.status);
          throw new Error(`xAI error: ${res.status}`);
        }

        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = (data.choices?.[0]?.message?.content ?? "").trim();
        if (!content) throw new Error("Empty response");
        return content;
      } finally {
        clearTimeout(timeoutId);
      }
    });

    return Response.json({ assignment: text });
  } catch (err) {
    if (err instanceof SemaphoreFullError) {
      return Response.json(
        { error: "The assignment service is busy due to high demand. Please try again in a moment." },
        { status: 503 }
      );
    }
    console.error("[assignment] Error:", err);
    return Response.json({ error: "Couldn't generate assignment right now." }, { status: 500 });
  }
}
