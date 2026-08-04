export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";
import { seedCourses } from "@/lib/data";

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rows } = await db.query<{ course_slug: string }>(
    `SELECT cc.course_slug
     FROM capstone_completions cc
     JOIN users u ON u.id = cc.user_id
     WHERE u.email = $1`,
    [session.user.email.toLowerCase()]
  );

  return Response.json({ completions: rows.map((r) => r.course_slug) });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { courseSlug?: string; completed?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { courseSlug, completed } = body;
  if (!courseSlug || typeof courseSlug !== "string") {
    return Response.json({ error: "Missing courseSlug." }, { status: 400 });
  }

  const { rows: userRows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const userId = userRows[0]?.id;
  if (!userId) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }

  if (completed) {
    await db.query(
      `INSERT INTO capstone_completions (user_id, course_slug)
       VALUES ($1, $2)
       ON CONFLICT (user_id, course_slug) DO NOTHING`,
      [userId, courseSlug]
    );
  } else {
    await db.query(
      "DELETE FROM capstone_completions WHERE user_id = $1 AND course_slug = $2",
      [userId, courseSlug]
    );
  }

  return Response.json({ ok: true });
}

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

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

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Assessment generation not configured." }, { status: 503 });
  }

  let body: { courseSlug?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { courseSlug } = body;
  if (!courseSlug || typeof courseSlug !== "string") {
    return Response.json({ error: "Missing courseSlug." }, { status: 400 });
  }

  const course = seedCourses.find((c) => c.slug === courseSlug);
  if (!course) {
    return Response.json({ error: "Course not found." }, { status: 404 });
  }
  if (!course.baseAssessment) {
    return Response.json({ error: "No assessment defined for this course." }, { status: 404 });
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
    `You are generating a personalised capstone assessment for a learner who has completed a full course.`,
    personaLine
      ? `${personaLine} Adapt the assessment's framing, examples, and context to their background and goal.`
      : "",
    ``,
    `Course: ${course.title}`,
    `Base assessment brief (adapt this to the learner's persona): ${course.baseAssessment}`,
    ``,
    `Write a personalised capstone assessment in 3-5 sentences. Be specific, actionable, and directly relevant to the learner's context and goals.`,
    `Do NOT include a title, heading, bullet points, or any markdown. Just return the plain assessment text.`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });

    if (!res.ok) {
      console.error("[course-assessment] xAI API error:", res.status);
      return Response.json({ error: "Couldn't generate assessment." }, { status: 500 });
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text) throw new Error("Empty response");

    return Response.json({ assessment: text });
  } catch (err) {
    console.error("[course-assessment] Error:", err);
    return Response.json({ error: "Couldn't generate assessment right now." }, { status: 500 });
  }
}
