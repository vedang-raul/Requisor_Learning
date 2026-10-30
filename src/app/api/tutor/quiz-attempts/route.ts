import { NextResponse } from "next/server";
import { requireAccess } from "@/lib/server/access";
import { manageReach } from "@/lib/server/course-scope";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { correctAnswerText, scoreAttempt } from "@/lib/quiz/quiz";
import { gradeAttempt, tutorAttempt, tutorAttempts } from "@/lib/quiz/quiz-store";
import { LESSON_ID } from "@/lib/quiz/quiz-access";

/**
 * Quiz attempts for grading, in courses the tutor owns (admins: that they manage).
 *   GET                 submitted attempts (?lessonId=… for one quiz)
 *   GET ?attemptId=…    one attempt: every question with the answer key, the
 *                       learner's answers and the points each earned
 *   POST { attemptId, manual: { questionId: points }, comment }
 *                       points for essay answers (and a comment); rescored
 * Like file submissions, a learner is named only to the tutors of that course.
 */
const noStore = { headers: { "Cache-Control": "private, no-store" } };

function detail(a: NonNullable<Awaited<ReturnType<typeof tutorAttempt>>>) {
  const s = scoreAttempt(a.quiz.questions, a.answers, a.manual);
  return {
    id: a.id, studentName: a.studentName, lessonId: a.lessonId, lessonTitle: a.lessonTitle, attempt: a.attempt,
    submittedAt: a.submittedAt, score: a.score, maxScore: a.maxScore, pending: a.pending, tutorComment: a.tutorComment,
    dueDate: a.quiz.settings.dueDate,
    questions: a.quiz.questions.map((q) => ({
      ...q, answer: a.answers[q.id] ?? null, earned: s.results[q.id].earned, status: s.results[q.id].status,
      correctAnswer: correctAnswerText(q), manual: a.manual[q.id] ?? null,
    })),
  };
}

export async function GET(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  const reach = manageReach(who);
  const params = new URL(req.url).searchParams;
  const attemptId = Number(params.get("attemptId"));
  if (params.has("attemptId")) {
    if (!Number.isSafeInteger(attemptId) || attemptId < 1) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });
    const a = await tutorAttempt(attemptId, who.userId, reach.all, reach.universityId);
    if (!a) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
    return NextResponse.json({ attempt: detail(a) }, noStore);
  }
  const lessonId = params.get("lessonId") ?? undefined;
  if (lessonId !== undefined && !LESSON_ID.test(lessonId)) return NextResponse.json({ error: "Invalid lesson." }, { status: 400 });
  return NextResponse.json({ attempts: await tutorAttempts(who.userId, reach.all, reach.universityId, lessonId) }, noStore);
}

export async function POST(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  let body: Record<string, unknown>;
  try {
    body = ((await readJsonBody(req, 64 * 1024)) ?? {}) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const id = Number(body.attemptId);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid attempt." }, { status: 400 });
  const reach = manageReach(who);
  const a = await tutorAttempt(id, who.userId, reach.all, reach.universityId);
  if (!a) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  await gradeAttempt(a, body.manual, body.comment, who.userId);
  const updated = await tutorAttempt(id, who.userId, reach.all, reach.universityId);
  return NextResponse.json({ attempt: detail(updated!) }, noStore);
}
