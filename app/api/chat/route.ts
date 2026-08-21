export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { acquireAiSlot, SemaphoreFullError } from "@/lib/ai-semaphore";

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

// ── Payload limits ────────────────────────────────────────────────────────────
const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_PROGRESS_CONTEXT_LENGTH = 4000;

// ── Upstream timeout ──────────────────────────────────────────────────────────
// If xAI hasn't started streaming within 30 s, abort and surface an error.
const UPSTREAM_TIMEOUT_MS = 30_000;

// ── Per-user rate limiter ─────────────────────────────────────────────────────
// 20 chat messages per user per minute.  Process-local; see LOAD_TEST.md for
// the Redis upgrade path for multi-instance deployments.
const chatLimiter = createRateLimiter(20, 60_000);

// ── Types ─────────────────────────────────────────────────────────────────────
type ChatMessage = { role: "user" | "assistant"; content: string };

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(progressContext: string): string {
  return `You are the Requisor Learning Assistant. Your sole responsibility is to help users navigate and use the Requisor Learning platform. You do NOT act as a full educational tutor.

You help users:
- find courses and lessons
- continue where they left off
- recommend the next lesson
- explain platform features
- summarize their progress
- compare available learning paths

The only available learning paths are: Data Analytics, Product Management, Cyber Security, Agentic AI.

Rules:
- Never invent courses, lessons, certificates, or features that are not in the provided context.
- If information is unavailable, say so rather than guessing.
- Keep answers concise (1–5 sentences).
- When referencing a lesson that exists in the provided data, wrap it as: {{lesson|Course Name|Lesson Name}}. Only use lesson tags for lessons present in the supplied context.
- When suggesting or recommending a whole course, wrap it as: {{course|slug|Course Title}} using exactly these slugs — data-analytics, product-management, cyber-security, agentic-ai. Never output raw JSON, curly braces, or structured data; always use these tags.

Current user progress context:
${progressContext}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // 1. Auth gate — checked before any other work
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized.", { status: 401 });
  }

  // 2. Per-user rate limit
  const { limited, retryAfterMs } = chatLimiter.check(session.user.email);
  if (limited) {
    return rateLimitResponse(retryAfterMs);
  }

  // 3. API key check
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(
      "The AI assistant isn't configured yet. Ask an admin to set XAI_API_KEY on the server.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  // 4. Parse and validate body
  let body: { messages?: ChatMessage[]; progressContext?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body.", { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ ...m, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }))
    .slice(-MAX_HISTORY);

  if (messages.length === 0) {
    return new Response("No message provided.", { status: 400 });
  }

  // 5. Conversation must end with a user turn
  if (messages[messages.length - 1].role !== "user") {
    return new Response("The last message must be from the user.", { status: 400 });
  }

  const rawContext = (body.progressContext ?? "No progress data available.").slice(
    0,
    MAX_PROGRESS_CONTEXT_LENGTH
  );
  const system = buildSystemPrompt(rawContext);

  // 6. Build combined AbortController (client disconnect + upstream timeout)
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort("timeout"), UPSTREAM_TIMEOUT_MS);
  req.signal.addEventListener("abort", () => timeoutController.abort("client_disconnect"), {
    once: true,
  });

  // 7. Acquire a semaphore slot BEFORE creating the stream so the slot is held
  //    for the entire stream lifetime — connection open → last byte sent.
  //    This bounds the total number of active concurrent xAI streams to
  //    AI_CONCURRENCY_LIMIT, not just the number being initiated.
  let releaseAiSlot: (() => void) | null = null;
  try {
    releaseAiSlot = await acquireAiSlot();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof SemaphoreFullError) {
      return new Response(
        "The AI assistant is temporarily busy due to high demand. Please try again in a moment.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }
    throw err;
  }

  // 8. Open xAI connection and pipe the SSE stream to the client.
  //    releaseAiSlot() is called in the finally block so the slot is always
  //    returned — whether the stream completes, errors, or the client disconnects.
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const xaiRes = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
          signal: timeoutController.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1024,
            stream: true,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        });

        if (!xaiRes.ok || !xaiRes.body) {
          const errText = await xaiRes.text().catch(() => `HTTP ${xaiRes.status}`);
          console.error("[chat] xAI API error:", xaiRes.status, errText);
          controller.enqueue(
            encoder.encode(
              "\n\n_Sorry, I couldn't reach the AI assistant just now. Please try again._"
            )
          );
          return;
        }

        const reader = xaiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.replace(/^data:\s*/, "");
            if (!trimmed || trimmed === "[DONE]") continue;
            try {
              const chunk = JSON.parse(trimmed) as {
                choices?: { delta?: { content?: string } }[];
              };
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      } catch (err) {
        const reason = timeoutController.signal.reason;
        if (reason === "timeout") {
          console.warn("[chat] xAI upstream timed out after", UPSTREAM_TIMEOUT_MS, "ms");
          controller.enqueue(
            encoder.encode(
              "\n\n_The AI assistant is taking too long to respond. Please try again._"
            )
          );
        } else if (reason === "client_disconnect") {
          console.info("[chat] Client disconnected, aborting stream.");
        } else {
          console.error("[chat] Streaming error:", err);
          controller.enqueue(
            encoder.encode(
              "\n\n_Sorry, I couldn't reach the AI assistant just now. Please try again._"
            )
          );
        }
      } finally {
        clearTimeout(timeoutId);
        releaseAiSlot?.(); // always return the semaphore slot
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
