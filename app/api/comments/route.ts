import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedCourses } from "@/lib/data";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { withAiConcurrency, SemaphoreFullError } from "@/lib/ai-semaphore";

const MAX_BODY_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ── Per-user rate limiter ─────────────────────────────────────────────────────
// 20 comment POSTs per user per minute; each triggers an AI moderation call.
const commentLimiter = createRateLimiter(20, 60_000);

// ── AI moderation ─────────────────────────────────────────────────────────────

interface ModerationResult {
  relevant: boolean;
  reason: string;
}

/**
 * Ask Grok whether a comment is on-topic for the lesson.
 * The fetch is wrapped in the global AI semaphore so comment moderation
 * participates in the same concurrency budget as all other xAI calls.
 * Returns { relevant: true } on any error so a service hiccup never silently
 * blocks a legitimate post.
 */
async function moderateComment(
  lessonId: string,
  commentBody: string
): Promise<ModerationResult> {
  try {
    // Look up lesson context from seed data
    const lesson = seedCourses
      .flatMap((c) => c.lessons)
      .find((l) => l.id === lessonId);

    const lessonContext = lesson
      ? `Title: ${lesson.title}\nDescription: ${lesson.description}\nKey takeaways: ${lesson.keyTakeaways.join("; ")}`
      : `Lesson ID: ${lessonId}`;

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { relevant: true, reason: "" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    // Run the moderation fetch through the shared AI semaphore so concurrent
    // comment submissions cannot bypass the global xAI concurrency limit.
    // SemaphoreFullError is caught below and treated as a pass (fail-open) so
    // legitimate comments are never blocked because the system is busy.
    const res = await withAiConcurrency(() =>
      fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.XAI_MODEL ?? "grok-3-mini",
          temperature: 0,
          max_tokens: 120,
          messages: [
            {
              role: "system",
              content:
                "You are a content moderator for an online learning platform. " +
                "Determine whether a discussion comment is relevant to the lesson provided. " +
                "A comment is relevant if it asks questions about the lesson content, " +
                "shares a related insight, requests clarification on a covered concept, " +
                "or provides constructive feedback about the material. " +
                "A comment is NOT relevant if it is off-topic chatter, spam, personal " +
                "conversations unrelated to the lesson, or promotional content. " +
                "Reply with ONLY valid JSON: {\"relevant\": true} or {\"relevant\": false, \"reason\": \"<one short sentence explaining why>\"}",
            },
            {
              role: "user",
              content: `LESSON:\n${lessonContext}\n\nCOMMENT:\n${commentBody}`,
            },
          ],
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout))
    );

    if (!res.ok) return { relevant: true, reason: "" };

    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "{}";

    // Strip markdown code fences if model wraps the JSON
    const jsonStr = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(jsonStr) as { relevant?: boolean; reason?: string };
    return {
      relevant: parsed.relevant !== false,
      reason: parsed.reason ?? "",
    };
  } catch (err) {
    // Fail open — never block a comment because AI is unavailable or overloaded
    if (err instanceof SemaphoreFullError) {
      console.info("[comments] AI semaphore full during moderation — failing open");
    }
    return { relevant: true, reason: "" };
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lessonId = req.nextUrl.searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });

  // Pagination: ?page=1&pageSize=20
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
  );
  const offset = (page - 1) * pageSize;

  const { rows } = await db.query<{
    id: number;
    user_name: string;
    body: string;
    created_at: string;
    total: string;
  }>(
    `SELECT id, user_name, body, created_at, COUNT(*) OVER() AS total
     FROM lesson_comments
     WHERE lesson_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [lessonId, pageSize, offset]
  );

  const total = rows.length > 0 ? parseInt(rows[0].total, 10) : 0;

  // Omit user_id to avoid leaking internal DB identifiers
  const comments = rows.map(({ id, user_name, body, created_at }) => ({
    id,
    user_name,
    body,
    created_at,
  }));

  return NextResponse.json({ comments, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Per-user rate limit — each comment POST triggers an AI moderation call
  const { limited, retryAfterMs } = commentLimiter.check(session.user.email);
  if (limited) {
    return rateLimitResponse(retryAfterMs, { json: true }) as NextResponse;
  }

  let lessonId: string | undefined;
  let body: string | undefined;
  try {
    ({ lessonId, body } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!lessonId || !body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const trimmedBody = body.trim();
  if (trimmedBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Comment must be ${MAX_BODY_LENGTH} characters or fewer.` },
      { status: 422 }
    );
  }

  const userName = session.user.name ?? session.user.email.split("@")[0];

  // AI moderation — reject off-topic comments before they reach the DB
  const moderation = await moderateComment(lessonId, trimmedBody);
  if (!moderation.relevant) {
    return NextResponse.json(
      {
        error: `Your comment appears to be off-topic for this lesson.${moderation.reason ? ` ${moderation.reason}` : ""} Please keep discussion relevant to the lesson content.`,
        moderated: true,
      },
      { status: 422 }
    );
  }

  const { rows } = await db.query<{
    id: number;
    user_name: string;
    body: string;
    created_at: string;
  }>(
    `INSERT INTO lesson_comments (user_id, user_name, user_email, lesson_id, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_name, body, created_at`,
    [session.user.id, userName, session.user.email, lessonId, trimmedBody]
  );

  return NextResponse.json({ comment: rows[0] }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const commentId = req.nextUrl.searchParams.get("id");
  if (!commentId) return NextResponse.json({ error: "Missing comment id" }, { status: 400 });

  // Users can only delete their own comments; admins can delete any
  const isAdmin = session.user.email === process.env.ADMIN_EMAIL || session.user.email === "support@requisor.io";

  const { rowCount } = await db.query(
    isAdmin
      ? `DELETE FROM lesson_comments WHERE id = $1`
      : `DELETE FROM lesson_comments WHERE id = $1 AND user_id = $2`,
    isAdmin ? [commentId] : [commentId, session.user.id]
  );

  if (!rowCount) {
    return NextResponse.json(
      { error: "Comment not found or you don't have permission to delete it." },
      { status: 404 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
