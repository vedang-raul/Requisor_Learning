export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Sets or updates the grade for one submission — recording this row is what
 * makes a submission count as "checked" in the lesson-level stats.
 *
 * Two payload shapes:
 *  - { submissionId, points } — points out of the lesson's total (100 when the
 *    lesson sets none), for lessons with no rubric. Stored as raw points plus
 *    the percentage, like a rubric grade. ({ marks } — a bare 0-100
 *    percentage — is still accepted.)
 *  - { submissionId, scores: [{criterionId, score}, ...] } — one score per
 *    the lesson's rubric criteria; marks is derived as
 *    sum(score)/sum(maxPoints)*100 so it stays comparable to a flat mark in
 *    cross-lesson stats even though rubrics have different point totals.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
// An optional status on the grade. Stored in the `remark` column, which held
// quality remarks (Excellent, Good, …) before statuses replaced them.
const STATUSES = new Set(["Excused", "Missing", "Late"]);

async function ownedSubmissionLesson(submissionId: number, userId: number, isAdmin: boolean) {
  const { rows } = await db.query<{ lesson_id: string }>(
    `SELECT s.lesson_id FROM assignment_submissions s JOIN courses c ON c.slug = s.course_slug
     WHERE s.id = $1 AND ($2::boolean OR c.owner_user_id = $3)`,
    [submissionId, isAdmin, userId]
  );
  return rows[0]?.lesson_id ?? null;
}

/** What a flat grade is out of: the lesson's total points, or 100 if it sets none. Null = not this tutor's submission. */
async function submissionTotalPoints(submissionId: number, userId: number, isAdmin: boolean): Promise<number | null> {
  const { rows } = await db.query<{ total: number }>(
    `SELECT COALESCE(l.assignment_marks, 100) AS total
     FROM assignment_submissions s JOIN courses c ON c.slug = s.course_slug
     LEFT JOIN course_lessons l ON l.id = s.lesson_id
     WHERE s.id = $1 AND ($2::boolean OR c.owner_user_id = $3)`,
    [submissionId, isAdmin, userId]
  );
  return rows[0] ? Number(rows[0].total) : null;
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const submissionId = Number(body.submissionId);
  if (!Number.isSafeInteger(submissionId) || submissionId < 1) {
    return Response.json({ error: "A valid submissionId is required." }, { status: 400 });
  }
  const rawStatus = typeof body.status === "string" ? body.status.trim() : "";
  if (rawStatus && rawStatus !== "None" && !STATUSES.has(rawStatus)) {
    return Response.json({ error: "Status must be Excused, Missing, Late or None." }, { status: 400 });
  }
  const remark = STATUSES.has(rawStatus) ? rawStatus : null;

  if (Array.isArray(body.scores)) {
    return gradeWithRubric(submissionId, body.scores, remark, userId, isAdmin);
  }

  let marks: number;
  let rawScore: number | null = null;
  let rawMax: number | null = null;
  if (body.points !== undefined) {
    const total = await submissionTotalPoints(submissionId, userId, isAdmin);
    if (total === null) return Response.json({ error: "Submission not found." }, { status: 404 });
    const points = Number(body.points);
    if (body.points === null || body.points === "" || !Number.isFinite(points) || points < 0 || points > total) {
      return Response.json({ error: `Points must be a number between 0 and ${total}.` }, { status: 400 });
    }
    rawScore = points;
    rawMax = total;
    marks = Math.round((points / total) * 1000) / 10;
  } else {
    marks = Number(body.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > 100) {
      return Response.json({ error: "The grade must be a number between 0 and 100." }, { status: 400 });
    }
  }
  const { rows } = await db.query<{ graded_at: string }>(
    `INSERT INTO assignment_grades (submission_id, marks, raw_score, raw_max, remark, graded_by, graded_at)
     SELECT s.id, $2, $6, $7, $3, $4, NOW()
     FROM assignment_submissions s JOIN courses c ON c.slug = s.course_slug
     WHERE s.id = $1 AND ($5::boolean OR c.owner_user_id = $4)
     ON CONFLICT (submission_id) DO UPDATE SET marks = EXCLUDED.marks, raw_score = EXCLUDED.raw_score, raw_max = EXCLUDED.raw_max, remark = EXCLUDED.remark, graded_by = EXCLUDED.graded_by, graded_at = NOW()
     RETURNING graded_at`,
    [submissionId, marks, remark, userId, isAdmin, rawScore, rawMax]
  );
  if (!rows[0]) return Response.json({ error: "Submission not found." }, { status: 404 });

  // A flat grade replaces any prior rubric breakdown for this submission —
  // otherwise a stale per-criterion score list would outlive the grade it summed to.
  await db.query("DELETE FROM assignment_grade_scores WHERE submission_id = $1", [submissionId]);

  return Response.json({ marks, rawScore, rawMax, status: remark, gradedAt: rows[0].graded_at });
}

async function gradeWithRubric(submissionId: number, scoresInput: unknown[], remark: string | null, userId: number, isAdmin: boolean) {
  const lessonId = await ownedSubmissionLesson(submissionId, userId, isAdmin);
  if (!lessonId) return Response.json({ error: "Submission not found." }, { status: 404 });

  const { rows: criteria } = await db.query<{ id: number; max_points: number }>(
    "SELECT id, max_points FROM assignment_rubric_criteria WHERE lesson_id = $1",
    [lessonId]
  );
  if (criteria.length === 0) return Response.json({ error: "This lesson has no rubric to grade against." }, { status: 400 });

  const maxByCriterion = new Map(criteria.map((c) => [c.id, c.max_points]));
  const scores = new Map<number, number>();
  for (const raw of scoresInput) {
    if (!raw || typeof raw !== "object") return Response.json({ error: "Invalid score." }, { status: 400 });
    const s = raw as Record<string, unknown>;
    const criterionId = Number(s.criterionId);
    const score = Number(s.score);
    const max = maxByCriterion.get(criterionId);
    if (max === undefined || !Number.isFinite(score) || score < 0 || score > max) {
      return Response.json({ error: "Each score must be between 0 and that criterion's max points." }, { status: 400 });
    }
    scores.set(criterionId, score);
  }
  if (scores.size !== criteria.length) {
    return Response.json({ error: "A score is required for every rubric criterion." }, { status: 400 });
  }

  const rawScore = [...scores.values()].reduce((sum, v) => sum + v, 0);
  const rawMax = criteria.reduce((sum, c) => sum + c.max_points, 0);
  const marks = Math.round((rawScore / rawMax) * 1000) / 10;

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM assignment_grade_scores WHERE submission_id = $1", [submissionId]);
    for (const [criterionId, score] of scores) {
      await client.query(
        "INSERT INTO assignment_grade_scores (submission_id, criterion_id, score) VALUES ($1,$2,$3)",
        [submissionId, criterionId, score]
      );
    }
    const { rows } = await client.query<{ graded_at: string }>(
      `INSERT INTO assignment_grades (submission_id, marks, raw_score, raw_max, remark, graded_by, graded_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (submission_id) DO UPDATE SET marks = EXCLUDED.marks, raw_score = EXCLUDED.raw_score, raw_max = EXCLUDED.raw_max, remark = EXCLUDED.remark, graded_by = EXCLUDED.graded_by, graded_at = NOW()
       RETURNING graded_at`,
      [submissionId, marks, rawScore, rawMax, remark, userId]
    );
    await client.query("COMMIT");
    return Response.json({ marks, rawScore, rawMax, status: remark, gradedAt: rows[0].graded_at });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(JSON.stringify({ operation: "tutor.grade.rubric", submissionId, error: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Couldn't save the grade." }, { status: 500 });
  } finally {
    client.release();
  }
}
