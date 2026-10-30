/** What the quiz panel on a lesson page gets: the quiz's terms, the learner's attempts, and the attempt in progress. */
import { attemptView, publicQuestions, type AttemptView, type PublicQuestion, type Quiz } from "@/lib/quiz/quiz";
import { keptFor, type Attempt, type StoredQuiz } from "@/lib/quiz/quiz-store";

export type LearnerQuiz = {
  quiz: {
    instructions: string; points: number; questionCount: number; timeLimitMin: number | null; allowedAttempts: number | null;
    scoringPolicy: Quiz["settings"]["scoringPolicy"]; oneQuestionAtATime: boolean; cantGoBack: boolean; dueDate: string | null;
  };
  attempts: { number: number; submittedAt: string; score: number | null; maxScore: number; pending: boolean; late: boolean }[];
  kept: number | null;
  attemptsLeft: number | null;
  canStart: boolean;
  inProgress: { attemptId: number; number: number; deadline: string | null; questions: PublicQuestion[]; answers: Attempt["answers"] } | null;
  result: (AttemptView & { number: number }) | null;
};

const isLate = (submittedAt: string, due: string | null) => Boolean(due && submittedAt.slice(0, 10) > due);

export function learnerView(stored: StoredQuiz, attempts: Attempt[], show?: number): LearnerQuiz {
  const s = stored.quiz.settings;
  const done = attempts.filter((a) => a.submittedAt);
  const open = attempts.find((a) => !a.submittedAt) ?? null;
  const attemptsLeft = s.allowedAttempts === null ? null : Math.max(0, s.allowedAttempts - attempts.length);
  const noneLeft = attemptsLeft === 0 && !open;
  const shown = show ? done.find((a) => a.attempt === show) : done[done.length - 1];
  return {
    quiz: {
      instructions: s.instructions, points: stored.points, questionCount: stored.quiz.questions.filter((q) => q.type !== "text_only").length,
      timeLimitMin: s.timeLimitMin, allowedAttempts: s.allowedAttempts, scoringPolicy: s.scoringPolicy,
      oneQuestionAtATime: s.oneQuestionAtATime, cantGoBack: s.cantGoBack, dueDate: s.dueDate,
    },
    attempts: done.map((a) => ({ number: a.attempt, submittedAt: a.submittedAt as string, score: a.score, maxScore: a.maxScore, pending: a.pending, late: isLate(a.submittedAt as string, a.quiz.settings.dueDate) })),
    kept: keptFor(done, s.scoringPolicy),
    attemptsLeft,
    canStart: !open && (attemptsLeft === null || attemptsLeft > 0),
    inProgress: open ? { attemptId: open.id, number: open.attempt, deadline: open.deadline, questions: publicQuestions(open.quiz, open.seed), answers: open.answers } : null,
    // Each attempt is shown by the rules of the quiz it was taken on.
    result: shown ? { number: shown.attempt, ...attemptView(shown.quiz, shown.seed, shown.answers, shown.score, shown.pending, shown.manual, noneLeft) } : null,
  };
}
