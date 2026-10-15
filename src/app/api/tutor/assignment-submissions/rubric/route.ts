export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { manageReach, type Reach } from "@/lib/server/course-scope";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";

/**
 * A lesson's grading rubric: a list of {title, description?, maxPoints}
 * criteria a tutor scores each submission against. GET lists the current
 * rubric; PUT replaces it in one call, but by id — an existing criterion
 * (id supplied) is updated in place so scores already recorded against it
 * survive; a criterion omitted from the payload is deleted (cascading its
 * scores, a deliberate tutor action); one with no id is inserted new.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const LESSON_ID_PATTERN = /^[a-z0-9-]{3,120}$/i;
const MAX_CRITERIA = 20;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;

async function ownedLesson(lessonId: string, userId: number, adminReach: Reach) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT l.id FROM course_lessons l JOIN courses c ON c.slug = l.course_slug
     WHERE l.id = $1 AND ($2::boolean OR (c.university_id IS NOT NULL AND c.university_id = $4::int) OR c.owner_user_id = $3)`,
    [lessonId, adminReach.all, userId, adminReach.universityId]
  );
  return Boolean(rows[0]);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Super admins reach every course; a university admin, their university's.
  const adminReach = manageReach(session.user);

  const lessonId = new URL(req.url).searchParams.get("lessonId")?.trim();
  if (!lessonId || !LESSON_ID_PATTERN.test(lessonId)) {
    return Response.json({ error: "A valid lessonId is required." }, { status: 400 });
  }
  if (!(await ownedLesson(lessonId, userId, adminReach))) {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }

  const { rows } = await db.query<{ id: number; title: string; description: string | null; max_points: number }>(
    `SELECT id, title, description, max_points FROM assignment_rubric_criteria
     WHERE lesson_id = $1 ORDER BY position ASC, id ASC`,
    [lessonId]
  );
  return Response.json({
    criteria: rows.map((r) => ({ id: r.id, title: r.title, description: r.description, maxPoints: r.max_points })),
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  // Super admins reach every course; a university admin, their university's.
  const adminReach = manageReach(session.user);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
  const criteriaInput = body.criteria;

  if (!lessonId || !LESSON_ID_PATTERN.test(lessonId) || !Array.isArray(criteriaInput) || criteriaInput.length > MAX_CRITERIA) {
    return Response.json({ error: "Invalid rubric." }, { status: 400 });
  }

  type CriterionInput = { id?: number; title: string; description: string | null; maxPoints: number };
  const criteria: CriterionInput[] = [];
  for (const raw of criteriaInput) {
    if (!raw || typeof raw !== "object") return Response.json({ error: "Invalid rubric criterion." }, { status: 400 });
    const c = raw as Record<string, unknown>;
    const title = typeof c.title === "string" ? c.title.trim() : "";
    const description = typeof c.description === "string" ? c.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) || null : null;
    const maxPoints = Number(c.maxPoints);
    const id = c.id !== undefined ? Number(c.id) : undefined;
    if (
      !title || title.length > MAX_TITLE_LENGTH ||
      !Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 1000 ||
      (id !== undefined && (!Number.isSafeInteger(id) || id < 1))
    ) {
      return Response.json({ error: "Each criterion needs a title and a positive max points value." }, { status: 400 });
    }
    criteria.push({ id, title, description, maxPoints });
  }

  if (!(await ownedLesson(lessonId, userId, adminReach))) {
    return Response.json({ error: "Lesson not found." }, { status: 404 });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows: existingRows } = await client.query<{ id: number }>(
      "SELECT id FROM assignment_rubric_criteria WHERE lesson_id = $1 FOR UPDATE",
      [lessonId]
    );
    const existingIds = new Set(existingRows.map((r) => r.id));
    const keptIds = new Set(criteria.filter((c) => c.id !== undefined).map((c) => c.id as number));

    for (const existingId of existingIds) {
      if (!keptIds.has(existingId)) {
        await client.query("DELETE FROM assignment_rubric_criteria WHERE id = $1", [existingId]);
      }
    }

    const saved: { id: number; title: string; description: string | null; maxPoints: number }[] = [];
    for (let i = 0; i < criteria.length; i++) {
      const c = criteria[i];
      if (c.id !== undefined && existingIds.has(c.id)) {
        await client.query(
          "UPDATE assignment_rubric_criteria SET title=$1, description=$2, max_points=$3, position=$4 WHERE id=$5",
          [c.title, c.description, c.maxPoints, i, c.id]
        );
        saved.push({ id: c.id, title: c.title, description: c.description, maxPoints: c.maxPoints });
      } else {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO assignment_rubric_criteria (lesson_id, title, description, max_points, position)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [lessonId, c.title, c.description, c.maxPoints, i]
        );
        saved.push({ id: rows[0].id, title: c.title, description: c.description, maxPoints: c.maxPoints });
      }
    }
    await client.query("COMMIT");
    return Response.json({ criteria: saved });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(JSON.stringify({ operation: "tutor.rubric.update", lessonId, error: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: "Couldn't save the rubric." }, { status: 500 });
  } finally {
    client.release();
  }
}
