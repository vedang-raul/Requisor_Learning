import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function buildSystemPrompt(): string {
  return [
    "You are an analytics assistant for an internal employee-learning admin panel (Requisor Learning).",
    "You'll be given a snapshot of course completion and an employee roster (demo/mock data). Write a short, skimmable summary for the admin/manager: a 1-2 sentence overview, then a short bulleted list of specific call-outs — who's falling behind and might need a nudge, who's excelling, which course is most/least popular — and end with one concrete suggested action.",
    "Be specific (name people, name courses) using only the data given. Never invent people or courses not listed. Keep the whole reply under 150 words.",
  ].join("\n");
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The AI assistant isn't configured yet. Ask an admin to set ANTHROPIC_API_KEY on the server." },
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

  const anthropic = new Anthropic({ apiKey });
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: body.context }],
    });
    const text = res.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return Response.json({ summary: text });
  } catch {
    return Response.json({ error: "Couldn't generate insights right now. Please try again." }, { status: 500 });
  }
}
