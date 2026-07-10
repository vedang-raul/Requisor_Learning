import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_HISTORY = 20;

type ChatMessage = { role: "user" | "assistant"; content: string };

function buildSystemPrompt(progressContext: string): string {
  return [
    "You are the Requisor Learning assistant — a friendly, concise AI coach embedded in an internal employee learning platform (like Udemy's AI assistant, but scoped to this company's courses).",
    "You help the learner understand their own progress, decide what to watch next, stay motivated, and answer questions about the four learning paths: Product Management, Data Analytics, Agentic AI, and Cyber Security.",
    "Use the learner's current progress data below to personalize answers — reference specific course/lesson names, completion percentages, streaks and XP when relevant. Don't invent lessons that aren't listed.",
    "Keep replies short and skimmable (a few sentences or a short list). If asked something unrelated to learning/progress, answer briefly and steer back.",
    "",
    "When you recommend a specific lesson the learner should watch next, make it clickable by wrapping it exactly as {{lesson|Exact Course Title|Exact Lesson Title}} inline in your sentence — e.g. \"Try {{lesson|Data Analytics|Podcast Intro: Data Science and AI}} next.\" Only use this tag for a course/lesson title pair that appears verbatim in the snapshot below (the 'next up' or 'recently viewed' lessons). Never invent a lesson title, and never use the tag for a course/lesson not listed there.",
    "",
    "=== Learner progress snapshot ===",
    progressContext,
  ].join("\n");
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      "The AI assistant isn't configured yet. Ask an admin to set ANTHROPIC_API_KEY on the server.",
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
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-MAX_HISTORY);

  if (messages.length === 0) {
    return new Response("No message provided.", { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });
  const system = buildSystemPrompt(body.progressContext ?? "No progress data available.");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          system,
          messages,
        });
        anthropicStream.on("text", (text) => controller.enqueue(encoder.encode(text)));
        await anthropicStream.finalMessage();
      } catch (err) {
        controller.enqueue(encoder.encode("\n\n_Sorry, I couldn't reach the AI assistant just now. Please try again._"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
