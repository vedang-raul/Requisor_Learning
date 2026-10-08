export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";
import {
  buildLearnerPersonaLine,
  findLessonForAi,
  insufficientContentResponse,
  lessonHasEnoughContent,
} from "@/lib/personalized-learning";
import { cleanTailoring } from "@/lib/assignment-format";
import { variationSeed } from "@/lib/assignment-ai";
import { assignmentPrompt, generateAssignment } from "@/lib/assignment-generate";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { SemaphoreFullError } from "@/lib/ai-semaphore";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";

const MAX_ASSIGNMENT_REQUEST_BYTES = 1024;

// ── Per-user rate limiter ─────────────────────────────────────────────────────
// Assignment generation: 10 per user per minute.
const assignmentLimiter = createRateLimiter(10, 60_000);

type LearnerRow = Pick<DbUser, "id" | "date_of_birth" | "qualification" | "learning_goal"> & { position: string | null };

function errorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "upstream_timeout";
  if (error instanceof Error) return error.name;
  return "unknown_error";
}

async function readLessonId(req: Request): Promise<{ lessonId: string } | Response> {
  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req, MAX_ASSIGNMENT_REQUEST_BYTES);
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

  const body = rawBody as Record<string, unknown>;
  if (
    Object.keys(body).length !== 1 ||
    typeof body.lessonId !== "string" ||
    !body.lessonId.trim()
  ) {
    return Response.json({ error: "A lessonId is required." }, { status: 400 });
  }

  return { lessonId: body.lessonId.trim() };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const lessonId = new URL(req.url).searchParams.get("lessonId")?.trim();
  const lesson = lessonId ? await findLessonForAi(lessonId) : null;
  if (!lesson) return Response.json({ error: "Lesson not found." }, { status: 404 });

  const { rows: userRows } = await db.query<Pick<DbUser, "id">>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  const { rows: cachedRows } = await db.query<{ content: string }>(
    "SELECT content FROM generated_assignments WHERE user_id = $1 AND lesson_id = $2",
    [user.id, lesson.id]
  );
  if (!cachedRows[0]) return Response.json({ error: "No saved assignment." }, { status: 404 });

  return Response.json({ assignment: cachedRows[0].content, cached: true });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await readLessonId(req);
  if (parsed instanceof Response) return parsed;

  const lesson = await findLessonForAi(parsed.lessonId);
  if (!lesson) return Response.json({ error: "Lesson not found." }, { status: 404 });
  // Don't spend tokens on a placeholder lesson. (Saved assignments stay
  // readable via GET, which never regenerates.)
  if (!lessonHasEnoughContent(lesson)) return insufficientContentResponse("assignment");

  // Load profile from DB — never trust caller-supplied profile values.
  const { rows: userRows } = await db.query<LearnerRow>(
    "SELECT id, date_of_birth, qualification, learning_goal, position FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  // A repeat visit is a database read, not an AI generation: return it before
  // checking the provider key or consuming a generation rate-limit slot.
  const { rows: cachedRows } = await db.query<{ content: string }>(
    "SELECT content FROM generated_assignments WHERE user_id = $1 AND lesson_id = $2",
    [user.id, lesson.id]
  );
  if (cachedRows[0]) {
    return Response.json({ assignment: cachedRows[0].content, cached: true });
  }

  const { limited, retryAfterMs } = assignmentLimiter.check(String(user.id));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Assignment generation is not configured." }, { status: 503 });
  }

  // When the tutor curates this assignment with AI, they choose which learner data it may use.
  const ai = lesson.assignmentAi ?? null;
  const may = (key: "background" | "goal" | "quiz") => !ai || ai.use.includes(key);
  const { rows: weakRows } = may("quiz")
    ? await db.query<{ concept: string }>(
        `SELECT concept FROM learner_mastery
         WHERE user_id = $1 AND mastery_score < 0.6
         ORDER BY mastery_score ASC, updated_at DESC
         LIMIT 3`,
        [user.id]
      )
    : { rows: [] as { concept: string }[] };
  const personaLine = buildLearnerPersonaLine({
    qualification: may("background") ? user.qualification : null,
    // The job title is only used for tutor-curated assignments; practice assignments are unchanged.
    position: ai && may("background") ? user.position : null,
    learningGoal: may("goal") ? user.learning_goal : null,
    dateOfBirth: may("background") ? user.date_of_birth : null,
    weakConcepts: weakRows.map((row) => row.concept),
  });
  // Shown to the learner (and tutor) as "tailored to" chips — taken from the
  // saved profile, never from the model, so they can't be hallucinated.
  const tailoredTo = cleanTailoring({
    background: may("background") ? user.qualification : null,
    goal: may("goal") ? user.learning_goal : null,
    reinforces: weakRows.map((row) => row.concept),
  });

  const prompt = assignmentPrompt({ lesson, personaLine, ai, seed: variationSeed(user.id, lesson.id) });

  try {
    const structured = await generateAssignment(apiKey, prompt, { userId: user.id, lessonId: lesson.id });
    const text = JSON.stringify(tailoredTo ? { ...structured, tailoredTo } : structured);

    await db.query(
      `INSERT INTO generated_assignments (user_id, lesson_id, content, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, lesson_id) DO NOTHING`,
      [user.id, lesson.id, text]
    );

    // If simultaneous tabs raced, the first persisted assignment wins so every
    // later visit stays stable for the learner.
    const { rows: persistedRows } = await db.query<{ content: string }>(
      "SELECT content FROM generated_assignments WHERE user_id = $1 AND lesson_id = $2",
      [user.id, lesson.id]
    );
    return Response.json({ assignment: persistedRows[0]?.content ?? text, cached: false });
  } catch (err) {
    if (err instanceof SemaphoreFullError) {
      return Response.json(
        { error: "The assignment service is busy due to high demand. Please try again in a moment." },
        { status: 503 }
      );
    }
    console.error("[assignment] generation failed", { userId: user.id, lessonId: lesson.id, reason: errorCode(err) });
    return Response.json({ error: "Couldn't generate assignment right now." }, { status: 500 });
  }
}
