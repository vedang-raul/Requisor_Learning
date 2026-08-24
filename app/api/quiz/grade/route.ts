export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";

const MAX_GRADE_REQUEST_BYTES = 8 * 1024;

type LearnerRow = Pick<DbUser, "id">;

type StoredQuizQuestion = {
  id: string;
  concept: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

type GradeResult = {
  id: string;
  correct: boolean;
  correctOption: string;
  explanation: string;
};

class GradeRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "GradeRequestError";
  }
}

function parseStoredQuestions(value: unknown): StoredQuizQuestion[] {
  const questions = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(questions) || questions.length !== 3) {
    throw new GradeRequestError(500, "Stored quiz is invalid.");
  }

  const ids = new Set<string>();
  for (const question of questions) {
    if (
      !question ||
      typeof question !== "object" ||
      typeof question.id !== "string" ||
      ids.has(question.id) ||
      typeof question.concept !== "string" ||
      !Array.isArray(question.options) ||
      question.options.length !== 4 ||
      !question.options.every((option: unknown) => typeof option === "string" && option.trim()) ||
      !Number.isInteger(question.correctIndex) ||
      question.correctIndex < 0 ||
      question.correctIndex > 3 ||
      typeof question.explanation !== "string"
    ) {
      throw new GradeRequestError(500, "Stored quiz is invalid.");
    }
    ids.add(question.id);
  }

  return questions as StoredQuizQuestion[];
}

async function readGradeRequest(
  req: Request
): Promise<{ quizId: number; answers: Record<string, number> } | Response> {
  let rawBody: unknown;
  try {
    rawBody = await readJsonBody(req, MAX_GRADE_REQUEST_BYTES);
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
  if (!Number.isInteger(body.quizId) || (body.quizId as number) <= 0 || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return Response.json({ error: "A valid quizId and answers are required." }, { status: 400 });
  }

  const answers = body.answers as Record<string, unknown>;
  if (Object.keys(answers).length !== 3 || !Object.entries(answers).every(([id, answer]) => /^q[1-3]$/.test(id) && Number.isInteger(answer) && (answer as number) >= 0 && (answer as number) <= 3)) {
    return Response.json({ error: "Answers must include one valid selection for each question." }, { status: 400 });
  }

  return { quizId: body.quizId as number, answers: answers as Record<string, number> };
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const parsed = await readGradeRequest(req);
  if (parsed instanceof Response) return parsed;

  const { rows: userRows } = await db.query<LearnerRow>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  const client = await db.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;

    const { rows: quizRows } = await client.query<{
      questions: StoredQuizQuestion[] | string;
      graded_at: Date | null;
    }>(
      `SELECT questions, graded_at
       FROM generated_quizzes
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [parsed.quizId, user.id]
    );
    const quiz = quizRows[0];
    if (!quiz) throw new GradeRequestError(404, "Quiz not found.");
    if (quiz.graded_at) throw new GradeRequestError(409, "This quiz was already submitted.");

    const questions = parseStoredQuestions(quiz.questions);
    const expectedIds = new Set(questions.map((question) => question.id));
    if (
      Object.keys(parsed.answers).some((id) => !expectedIds.has(id)) ||
      questions.some((question) => parsed.answers[question.id] === undefined)
    ) {
      throw new GradeRequestError(400, "Answers must match this quiz.");
    }

    const results: GradeResult[] = questions.map((question) => ({
      id: question.id,
      correct: parsed.answers[question.id] === question.correctIndex,
      correctOption: question.options[question.correctIndex],
      explanation: question.explanation.slice(0, 700),
    }));

    const byConcept = new Map<string, { total: number; correct: number }>();
    questions.forEach((question, index) => {
      const aggregate = byConcept.get(question.concept) ?? { total: 0, correct: 0 };
      aggregate.total += 1;
      if (results[index].correct) aggregate.correct += 1;
      byConcept.set(question.concept, aggregate);
    });

    for (const [concept, aggregate] of byConcept) {
      const score = aggregate.correct / aggregate.total;
      await client.query(
        `INSERT INTO learner_mastery (user_id, concept, mastery_score, attempts, updated_at)
         VALUES ($1, $2, $3, 1, NOW())
         ON CONFLICT (user_id, concept)
         DO UPDATE SET mastery_score = learner_mastery.mastery_score * 0.7 + EXCLUDED.mastery_score * 0.3,
                       attempts = learner_mastery.attempts + 1,
                       updated_at = NOW()`,
        [user.id, concept, score]
      );
    }

    const score = results.filter((result) => result.correct).length;
    await client.query(
      `UPDATE generated_quizzes
       SET graded_at = NOW(), grade_results = $1
       WHERE id = $2 AND user_id = $3`,
      [JSON.stringify({ score, total: questions.length, results }), parsed.quizId, user.id]
    );
    await client.query("COMMIT");
    transactionOpen = false;

    // The answer index never leaves storage. After a closed attempt, the UI can
    // show correctness, the correct option text, and a learning explanation.
    return Response.json({ score, total: questions.length, results });
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => undefined);

    if (error instanceof GradeRequestError) {
      if (error.status >= 500) {
        console.error("[quiz-grade] invalid stored quiz", { userId: user.id, quizId: parsed.quizId });
      }
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[quiz-grade] grading failed", {
      userId: user.id,
      quizId: parsed.quizId,
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return Response.json({ error: "Couldn't grade this quiz right now. Please try again." }, { status: 500 });
  } finally {
    client.release();
  }
}