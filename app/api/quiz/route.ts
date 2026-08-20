export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";
const MAX_QUIZ_REQUEST_BYTES = 8 * 1024;

// Input length caps to prevent oversized prompt-injection payloads
const MAX_TITLE_LENGTH = 200;
const MAX_DESC_LENGTH = 1000;
const MAX_TAKEAWAY_LENGTH = 200;
const MAX_TAKEAWAYS = 10;

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

function buildPersonaLine(
  qualification: string | null,
  learningGoal: string | null,
  ageYears: number | null
): string {
  const parts: string[] = [];
  if (qualification) parts.push(`background: ${qualification}`);
  if (ageYears) parts.push(`age: ${ageYears} years old`);
  if (learningGoal) parts.push(`learning goal: ${learningGoal}`);
  if (!parts.length) return "";
  return (
    `The learner has the following profile — ${parts.join(", ")}. ` +
    `Tailor the difficulty, vocabulary, and real-world examples of your questions to match this profile. ` +
    `Use domain-specific analogies familiar to their background and adjust complexity to their likely experience level.`
  );
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

function isValidQuestion(q: unknown): q is QuizQuestion {
  if (!q || typeof q !== "object") return false;
  const obj = q as Record<string, unknown>;
  return (
    typeof obj.question === "string" &&
    obj.question.trim().length > 0 &&
    Array.isArray(obj.options) &&
    obj.options.length === 4 &&
    obj.options.every((o) => typeof o === "string" && o.trim().length > 0) &&
    typeof obj.correctIndex === "number" &&
    Number.isInteger(obj.correctIndex) &&
    obj.correctIndex >= 0 &&
    obj.correctIndex <= 3 &&
    typeof obj.explanation === "string" &&
    obj.explanation.trim().length > 0
  );
}

export async function POST(req: Request) {
  // Auth gate — checked first, before API key lookup or body parsing
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The AI assistant isn't configured yet. Ask an admin to set XAI_API_KEY on the server." },
      { status: 503 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req, MAX_QUIZ_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json({ error: "Request body is too large." }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = rawBody as {
    lessonTitle?: string;
    description?: string;
    keyTakeaways?: string[];
  };

  const { lessonTitle, description, keyTakeaways } = body;
  if (!lessonTitle || typeof lessonTitle !== "string" || !lessonTitle.trim()) {
    return Response.json({ error: "Missing lessonTitle." }, { status: 400 });
  }

  // Sanitise inputs — cap lengths to prevent prompt injection
  const safeTitle = lessonTitle.trim().slice(0, MAX_TITLE_LENGTH);
  const safeDesc = typeof description === "string" ? description.trim().slice(0, MAX_DESC_LENGTH) : "";
  const safeTakeaways = Array.isArray(keyTakeaways)
    ? keyTakeaways
        .filter((t) => typeof t === "string" && t.trim().length > 0)
        .slice(0, MAX_TAKEAWAYS)
        .map((t) => t.trim().slice(0, MAX_TAKEAWAY_LENGTH))
    : [];

  // Load profile server-side — never trust caller-supplied profile values
  const { rows } = await db.query<DbUser>(
    "SELECT date_of_birth, qualification, learning_goal FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = rows[0];
  let personaLine = "";
  if (user) {
    const dob = user.date_of_birth ? new Date(user.date_of_birth) : null;
    const ageYears = dob
      ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000))
      : null;
    personaLine = buildPersonaLine(user.qualification ?? null, user.learning_goal ?? null, ageYears);
  }

  const prompt = [
    personaLine,
    "Generate exactly 3 multiple-choice questions to check understanding of this lesson:",
    `Title: ${safeTitle}`,
    safeDesc ? `Description: ${safeDesc}` : "",
    safeTakeaways.length ? `Key takeaways: ${safeTakeaways.join("; ")}` : "",
    "",
    "Respond with ONLY valid JSON — no markdown fences, no commentary — matching this shape exactly:",
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
      console.error("[quiz] Malformed response — no questions array:", text);
      throw new Error("Malformed quiz response");
    }

    // Validate every question matches the expected shape before returning to the client
    const validQuestions = parsed.questions.filter(isValidQuestion);
    if (validQuestions.length === 0) {
      console.error("[quiz] No valid questions after shape validation:", parsed.questions);
      throw new Error("Quiz questions failed shape validation");
    }

    return Response.json({ questions: validQuestions });
  } catch (err) {
    console.error("[quiz] Error:", err);
    return Response.json(
      { error: "Couldn't generate a quiz right now. Please try again." },
      { status: 500 }
    );
  }
}
