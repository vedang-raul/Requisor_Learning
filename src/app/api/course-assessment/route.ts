export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { xaiFetch } from "@/lib/ai/usage";
import { authOptions } from "@/lib/auth/auth";
import { db, type DbUser } from "@/lib/server/db";
import { seedCourses } from "@/lib/courses/data";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { withAiConcurrency, SemaphoreFullError, AI_UPSTREAM_TIMEOUT_MS } from "@/lib/ai/ai-semaphore";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { ensureCourseCatalog } from "@/lib/courses/course-catalog";

// ── Per-user rate limiter ─────────────────────────────────────────────────────
// Capstone assessment is the most expensive AI call — 5 per user per minute.
const assessmentLimiter = createRateLimiter(5, 60_000);
const completionLimiter = createRateLimiter(30, 60_000);
const MAX_BODY_BYTES = 2048;
// Includes tutor-authored courses without permitting unbounded per-user rows.
const MAX_COMPLETIONS = 1000;

const BASE_URL = "https://api.x.ai/v1";
const MODEL = process.env.XAI_MODEL || "grok-3-mini";

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureCourseCatalog();
  const { rows } = await db.query<{ course_slug: string }>(
    `SELECT cc.course_slug
     FROM capstone_completions cc
     JOIN users u ON u.id = cc.user_id
     JOIN courses c ON c.slug = cc.course_slug
     WHERE u.email = $1 AND octet_length(cc.course_slug) <= 80
     ORDER BY cc.completed_at DESC, cc.id DESC
     LIMIT $2`,
    [session.user.email.toLowerCase(), MAX_COMPLETIONS]
  );

  return Response.json({ completions: rows.map((r) => r.course_slug) });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { limited, retryAfterMs } = completionLimiter.check(session.user.email.toLowerCase());
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (err) {
    return Response.json({ error: "Invalid request body." }, { status: err instanceof RequestBodyTooLargeError ? 413 : 400 });
  }

  const { courseSlug, completed } = (body ?? {}) as { courseSlug?: unknown; completed?: unknown };
  if (typeof courseSlug !== "string" || courseSlug.length > 80 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(courseSlug) || typeof completed !== "boolean") {
    return Response.json({ error: "Missing courseSlug." }, { status: 400 });
  }

  await ensureCourseCatalog();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Same user lock as report quotas: serializes additions across workers.
    const { rows: userRows } = await client.query<{ id: number }>(
      "SELECT id FROM users WHERE email = $1 FOR UPDATE",
      [session.user.email.toLowerCase()]
    );
    const userId = userRows[0]?.id;
    if (!userId) {
      await client.query("ROLLBACK");
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    if (completed) {
      // Use the authoritative catalog, not seed data: tutors also author capstones.
      // Keep the course alive through insertion even on legacy schemas without an FK.
      const course = await client.query("SELECT slug FROM courses WHERE slug = $1 FOR KEY SHARE", [courseSlug]);
      if (!course.rows.length) {
        await client.query("ROLLBACK");
        return Response.json({ error: "Course not found." }, { status: 404 });
      }
      const existing = await client.query(
        "SELECT course_slug FROM capstone_completions WHERE user_id = $1 AND course_slug = $2", [userId, courseSlug]
      );
      if (!existing.rows.length) {
        const { rows: usage } = await client.query<{ count: string }>(
          "SELECT COUNT(*) AS count FROM capstone_completions WHERE user_id = $1", [userId]
        );
        if (Number(usage[0].count) >= MAX_COMPLETIONS) {
          await client.query("ROLLBACK");
          return Response.json({ error: "Course completion limit reached." }, { status: 429 });
        }
        await client.query(
          `INSERT INTO capstone_completions (user_id, course_slug)
           VALUES ($1, $2)
           ON CONFLICT (user_id, course_slug) DO NOTHING`,
          [userId, courseSlug]
        );
      }
    } else {
      // Allow users to remove their own legacy records, even if a course was deleted.
      await client.query(
        "DELETE FROM capstone_completions WHERE user_id = $1 AND course_slug = $2",
        [userId, courseSlug]
      );
    }
    await client.query("COMMIT");
    return Response.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

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

  // Per-user rate limit — capstone assessment is the most expensive AI call
  const { limited, retryAfterMs } = assessmentLimiter.check(session.user.email);
  if (limited) {
    return rateLimitResponse(retryAfterMs, { json: true });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Assessment generation not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (err) {
    return Response.json({ error: "Invalid request body." }, { status: err instanceof RequestBodyTooLargeError ? 413 : 400 });
  }

  const { courseSlug } = (body ?? {}) as { courseSlug?: unknown };
  if (!courseSlug || typeof courseSlug !== "string" || courseSlug.length > 200) {
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
    const text = await withAiConcurrency(async () => {
      const aborter = new AbortController();
      const timeoutId = setTimeout(() => aborter.abort("upstream_timeout"), AI_UPSTREAM_TIMEOUT_MS);
      try {
        const res = await xaiFetch({ userId: session.user.id, feature: "course_assessment" }, `${BASE_URL}/chat/completions`, {
          method: "POST",
          signal: aborter.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
        });

        if (!res.ok) {
          console.error("[course-assessment] xAI API error:", res.status);
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

    return Response.json({ assessment: text });
  } catch (err) {
    if (err instanceof SemaphoreFullError) {
      return Response.json(
        { error: "The assessment service is busy due to high demand. Please try again in a moment." },
        { status: 503 }
      );
    }
    console.error("[course-assessment] Error:", err);
    return Response.json({ error: "Couldn't generate assessment right now." }, { status: 500 });
  }
}
