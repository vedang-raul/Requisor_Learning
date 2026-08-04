export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

// Hard limits to prevent oversized / injected payloads
const MAX_HISTORY = 20;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_PROGRESS_CONTEXT_LENGTH = 4000;

type ChatMessage = { role: "user" | "assistant"; content: string };

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

Current user progress context:
${progressContext}`;
}

export async function POST(req: Request) {
  // Auth gate — reject before touching the xAI API or parsing the body
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(
      "The AI assistant isn't configured yet. Ask an admin to set XAI_API_KEY on the server.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

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
    // Cap each individual message to prevent oversized injections
    .map((m) => ({ ...m, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }))
    .slice(-MAX_HISTORY);

  if (messages.length === 0) {
    return new Response("No message provided.", { status: 400 });
  }

  const rawContext = (body.progressContext ?? "No progress data available.").slice(
    0,
    MAX_PROGRESS_CONTEXT_LENGTH
  );
  const system = buildSystemPrompt(rawContext);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const res = await fetch(`${BASE_URL}/chat/completions`, {
          method: "POST",
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

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          console.error("[chat] xAI API error:", res.status, errText);
          controller.enqueue(
            encoder.encode("\n\n_Sorry, I couldn't reach the AI assistant just now. Please try again._")
          );
          return;
        }

        const reader = res.body.getReader();
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
        console.error("[chat] Streaming error:", err);
        controller.enqueue(
          encoder.encode("\n\n_Sorry, I couldn't reach the AI assistant just now. Please try again._")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
