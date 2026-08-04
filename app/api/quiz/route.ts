export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

function buildPersonaLine(qualification: string | null, learningGoal: string | null, ageYears: number | null): string {
  const parts: string[] = [];
  if (qualification) parts.push(`background: ${qualification}`);
  if (ageYears) parts.push(`age: ${ageYears} years old`);
  if (learningGoal) parts.push(`learning goal: ${learningGoal}`);
  if (!parts.length) return "";
  return `The learner has the following profile — ${parts.join(", ")}. Tailor the difficulty, vocabulary, and real-world examples of your questions to match this profile. For example, use domain-specific analogies familiar to their background, and adjust complexity to their likely experience level.`;
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

  // Authentication gate — reject unauthenticated callers before touching the xAI API.
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Load profile from DB server-side — do not trust caller-supplied profile values
  let personaLine = "";
  if (session.user.email) {
    const { rows } = await db.query<DbUser>(
      "SELECT date_of_birth, qualification, learning_goal FROM users WHERE email = $1",
      [session.user.email.toLowerCase()]
    );
    const user = rows[0];
    if (user) {
      const dob = user.date_of_birth ? new Date(user.date_of_birth) : null;
      const ageYears = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)) : null;
      personaLine = buildPersonaLine(user.qualification ?? null, user.learning_goal ?? null, ageYears);
    }
  }

  const prompt = [
    personaLine,
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
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
