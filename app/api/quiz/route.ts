import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The AI assistant isn't configured yet. Ask an admin to set ANTHROPIC_API_KEY on the server." },
      { status: 503 }
    );
  }

  let body: { lessonTitle?: string; description?: string; keyTakeaways?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { lessonTitle, description, keyTakeaways } = body;
  if (!lessonTitle || typeof lessonTitle !== "string") {
    return Response.json({ error: "Missing lessonTitle." }, { status: 400 });
  }

  const prompt = [
    "Generate exactly 3 multiple-choice questions to check understanding of this lesson:",
    `Title: ${lessonTitle}`,
    description ? `Description: ${description}` : "",
    keyTakeaways?.length ? `Key takeaways: ${keyTakeaways.join("; ")}` : "",
    "",
    "Respond with ONLY valid JSON, no markdown code fences, no commentary, matching exactly this shape:",
    `{"questions":[{"question":string,"options":[string,string,string,string],"correctIndex":number,"explanation":string}]}`,
    "correctIndex is the 0-based index into options. Keep questions and options short and unambiguous.",
  ]
    .filter(Boolean)
    .join("\n");

  const anthropic = new Anthropic({ apiKey });

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = JSON.parse(extractJson(text));
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error("Malformed quiz response");
    }
    return Response.json({ questions: parsed.questions });
  } catch {
    return Response.json({ error: "Couldn't generate a quiz right now. Please try again." }, { status: 500 });
  }
}
