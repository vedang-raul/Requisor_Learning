import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/server/access";
import { attemptsFor, getQuiz } from "@/lib/quiz/quiz-store";
import { learnerLessonCourse } from "@/lib/quiz/quiz-access";
import { learnerView } from "@/lib/quiz/learner-view";

/**
 * A lesson's graded quiz, as the signed-in learner sees it: its terms, their
 * attempts and score, the attempt in progress (questions without answers),
 * and the latest result (or ?attempt=N) under the quiz's rules for showing
 * results and correct answers. { quiz: null } when the lesson has no quiz.
 */
export async function GET(req: Request) {
  const who = await requireAccess("signed-in");
  if (who instanceof Response) return who;
  const params = new URL(req.url).searchParams;
  const lessonId = params.get("lessonId");
  if (!(await learnerLessonCourse(lessonId, who))) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  const stored = await getQuiz(lessonId as string);
  if (!stored) return NextResponse.json({ quiz: null }, { headers: { "Cache-Control": "no-store" } });
  const show = Number(params.get("attempt")) || undefined;
  return NextResponse.json(learnerView(stored, await attemptsFor(who.userId, stored.lessonId), show), { headers: { "Cache-Control": "no-store" } });
}
