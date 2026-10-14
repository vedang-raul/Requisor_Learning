export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";

/**
 * A thumbs up or down on one of the assistant's replies.
 *   POST { id, rating: "up" | "down" | null, reply, question?, mode? }
 * `id` is made by the browser for that reply, so changing your mind updates
 * the same record and a null rating removes it. The reply and the question it
 * answered are kept with the rating, so a bad answer can be looked at later.
 */
const MAX_REQUEST_BYTES = 16 * 1024;
const feedbackLimiter = createRateLimiter(60, 60_000);
const FEEDBACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await readJsonBody(req, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const id = typeof body.id === "string" && FEEDBACK_ID.test(body.id) ? body.id.toLowerCase() : null;
  if (!id) return Response.json({ error: "Invalid feedback id." }, { status: 400 });
  const rating = body.rating === "up" || body.rating === "down" ? body.rating : body.rating === null ? null : undefined;
  if (rating === undefined) return Response.json({ error: "rating must be \"up\", \"down\" or null." }, { status: 400 });

  const { limited, retryAfterMs } = feedbackLimiter.check(String(userId));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  if (rating === null) {
    await db.query("DELETE FROM assistant_feedback WHERE user_id = $1 AND feedback_id = $2", [userId, id]);
    return Response.json({ rating: null });
  }
  const reply = text(body.reply, 4000);
  if (!reply) return Response.json({ error: "The reply being rated is missing." }, { status: 400 });
  await db.query(
    `INSERT INTO assistant_feedback (user_id, feedback_id, rating, question, reply, mode)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, feedback_id) DO UPDATE SET rating = EXCLUDED.rating, updated_at = NOW()`,
    [userId, id, rating, text(body.question, 2000), reply, body.mode === "tutor" ? "tutor" : "learner"]
  );
  return Response.json({ rating });
}
