import { NextResponse } from "next/server";
import { requireAccess, type RequestAccess } from "@/lib/server/access";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { attemptsFor, getQuiz, saveAnswers, startAttempt, submitAttempt } from "@/lib/quiz/quiz-store";
import { learnerLessonCourse } from "@/lib/quiz/quiz-access";
import { learnerView } from "@/lib/quiz/learner-view";
import { createRateLimiter } from "@/lib/server/rate-limit";

/**
 * Taking a lesson's quiz (own attempts only):
 *   POST  { lessonId }                start an attempt (or carry on with the open one)
 *   PATCH { attemptId, answers }      save answers so far (kept if a timed quiz runs out)
 *   PUT   { attemptId, answers }      hand in: scored on the server; returns the quiz panel
 */
const saving = createRateLimiter(120, 60_000);
const noStore = { headers: { "Cache-Control": "no-store" } };

async function body(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const value = await readJsonBody(req, 256 * 1024);
    return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Too much to save at once." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
}

async function panel(who: RequestAccess, lessonId: string) {
  const stored = await getQuiz(lessonId);
  return stored ? learnerView(stored, await attemptsFor(who.userId, lessonId)) : null;
}

export async function POST(req: Request) {
  const who = await requireAccess("signed-in");
  if (who instanceof Response) return who;
  const input = await body(req);
  if (input instanceof Response) return input;
  if (!(await learnerLessonCourse(input.lessonId, who))) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  const stored = await getQuiz(input.lessonId as string);
  if (!stored) return NextResponse.json({ error: "This lesson has no quiz." }, { status: 404 });
  const started = await startAttempt(who.userId, stored);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  return NextResponse.json(await panel(who, stored.lessonId), noStore);
}

export async function PATCH(req: Request) {
  const who = await requireAccess("signed-in");
  if (who instanceof Response) return who;
  if (saving.check(String(who.userId)).limited) return NextResponse.json({ error: "Saving too often." }, { status: 429 });
  const input = await body(req);
  if (input instanceof Response) return input;
  const id = Number(input.attemptId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });
  const result = await saveAnswers(id, who.userId, input.answers);
  if (result === "missing") return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  return NextResponse.json({ saved: result === "saved", closed: result === "closed" }, noStore);
}

export async function PUT(req: Request) {
  const who = await requireAccess("signed-in");
  if (who instanceof Response) return who;
  const input = await body(req);
  if (input instanceof Response) return input;
  const id = Number(input.attemptId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });
  const attempt = await submitAttempt(id, who.userId, input.answers);
  if (!attempt) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  return NextResponse.json(await panel(who, attempt.lessonId), noStore);
}
