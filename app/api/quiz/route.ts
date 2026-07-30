export const runtime = "nodejs";

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function POST(req: Request) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The AI assistant isn't configured yet. Ask an admin to set XAI_API_KEY on the server." },
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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      console.error("[quiz] xAI API error:", res.status, errText);
      const isConfigError = res.status === 401 || res.status === 403 || res.status === 404;
      return Response.json(
        {
          error: isConfigError
            ? "Quiz generation is misconfigured. Check XAI_API_KEY and XAI_MODEL."
            : "Couldn't generate a quiz right now. Please try again.",
        },
        { status: isConfigError ? 503 : 500 }
      );
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(extractJson(text)) as { questions: unknown[] };

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      console.error("[quiz] Malformed response:", text);
      throw new Error("Malformed quiz response");
    }

    return Response.json({ questions: parsed.questions });
  } catch (err) {
    console.error("[quiz] Error:", err);
    return Response.json(
      { error: "Couldn't generate a quiz right now. Please try again." },
      { status: 500 }
    );
  }
}
