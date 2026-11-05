export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { canSeeCourse } from "@/lib/server/course-scope";
import { findLessonLocation } from "@/lib/courses/course-catalog";
import { lessonNda, signatureFor, signNda } from "@/lib/courses/assignment-nda";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";

/**
 * A branded assignment's confidentiality agreement, for the learner.
 *   GET  ?lessonId=…                  → { required: false } | { required, signed: false, text, brandName }
 *                                        | { required, signed: true, signedName, signedAt, brief }
 *   POST { lessonId, name, agree: true } → signs it: { signed: true, signedName, signedAt, brief }
 * The brief of an NDA lesson is only ever sent from here, once signed.
 */
const signLimiter = createRateLimiter(20, 10 * 60_000, "assignment:nda");

async function learner(lessonId: unknown) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const location = await findLessonLocation(lessonId);
  // Only lessons the learner can open: not drafts, not another university's.
  if (!location || !location.visibleToLearners || !canSeeCourse(session.user, location.universityId)) return Response.json({ error: "Lesson not found." }, { status: 404 });
  const { rows } = await db.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [session.user.email.toLowerCase()]);
  if (!rows[0]) return Response.json({ error: "Profile not found." }, { status: 404 });
  return { userId: rows[0].id, lessonId: location.lessonId };
}

export async function GET(req: Request) {
  const who = await learner(new URL(req.url).searchParams.get("lessonId")?.trim());
  if (who instanceof Response) return who;
  const nda = await lessonNda(who.lessonId);
  if (!nda) return Response.json({ required: false });
  const signed = await signatureFor(who.userId, who.lessonId, nda.text);
  return signed
    ? Response.json({ required: true, signed: true, ...signed, brief: nda.brief })
    : Response.json({ required: true, signed: false, text: nda.text, brandName: nda.brandName });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const raw = await readJsonBody(req, 4_096);
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError || error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const who = await learner(typeof body.lessonId === "string" ? body.lessonId.trim() : "");
  if (who instanceof Response) return who;
  const { limited, retryAfterMs } = await signLimiter.check(String(who.userId));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (name.length < 2 || name.length > 120) return Response.json({ error: "Type your full name to sign." }, { status: 400 });
  if (body.agree !== true) return Response.json({ error: "Tick the box to confirm you agree." }, { status: 400 });
  const nda = await lessonNda(who.lessonId);
  if (!nda) return Response.json({ error: "This assignment has no agreement to sign." }, { status: 409 });
  const signed = await signNda(who.userId, who.lessonId, nda.text, name);
  return Response.json({ signed: true, ...signed, brief: nda.brief });
}
