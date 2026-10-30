import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/server/access";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { checkQuiz } from "@/lib/quiz/quiz";
import { deleteQuiz, getQuiz, saveQuiz } from "@/lib/quiz/quiz-store";
import { managedLessonCourse } from "@/lib/quiz/quiz-access";

/**
 * A lesson's graded quiz, for the tutor who manages the course (the lesson
 * wizard saves it right after the lesson itself, like the rubric).
 *   GET    ?lessonId=…          { quiz, points } or { quiz: null }
 *   PUT    { lessonId, quiz }   checks and saves it
 *   DELETE ?lessonId=…          removes it (the lesson is no longer a quiz)
 * The answers are in the quiz: never sent to learners (see /api/quiz/*).
 */
const noStore = { headers: { "Cache-Control": "private, no-store" } };
const notFound = () => NextResponse.json({ error: "Lesson not found." }, { status: 404 });

export async function GET(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  const lessonId = new URL(req.url).searchParams.get("lessonId");
  if (!(await managedLessonCourse(lessonId, who))) return notFound();
  const stored = await getQuiz(lessonId as string);
  return NextResponse.json(stored ? { quiz: stored.quiz, points: stored.points } : { quiz: null }, noStore);
}

export async function PUT(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  let body: unknown;
  try {
    body = await readJsonBody(req, 1024 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "The quiz is too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const input = (body ?? {}) as { lessonId?: unknown; quiz?: unknown };
  const courseSlug = await managedLessonCourse(input.lessonId, who);
  if (!courseSlug) return notFound();
  const checked = checkQuiz(input.quiz);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  await saveQuiz(input.lessonId as string, courseSlug, checked.quiz, checked.points, who.userId);
  return NextResponse.json({ quiz: checked.quiz, points: checked.points }, noStore);
}

export async function DELETE(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  const lessonId = new URL(req.url).searchParams.get("lessonId");
  if (!(await managedLessonCourse(lessonId, who))) return notFound();
  await deleteQuiz(lessonId as string);
  return NextResponse.json({ ok: true }, noStore);
}
