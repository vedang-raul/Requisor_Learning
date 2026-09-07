export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Markup a tutor leaves while reviewing one submission: pinned comments,
 * whole-paragraph highlights (docx), and freehand strokes (pdf page or docx
 * canvas). Same ownership model as the rest of this submission-grading
 * surface — the tutor who owns the submission's course, or an admin.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const KINDS = new Set(["comment", "highlight", "draw"]);
const MAX_BODY_LENGTH = 2000;
const MAX_STROKE_POINTS_LENGTH = 20_000; // ~ a few hundred points as "x,y;x,y;..."

async function ownedSubmission(submissionId: number, userId: number, isAdmin: boolean) {
  const { rows } = await db.query<{ id: number }>(
    `SELECT s.id FROM assignment_submissions s
     JOIN courses c ON c.slug = s.course_slug
     WHERE s.id = $1 AND ($2::boolean OR c.owner_user_id = $3)`,
    [submissionId, isAdmin, userId]
  );
  return Boolean(rows[0]);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const submissionId = Number(new URL(req.url).searchParams.get("submissionId"));
  if (!Number.isSafeInteger(submissionId) || submissionId < 1) {
    return Response.json({ error: "A valid submissionId is required." }, { status: 400 });
  }
  if (!(await ownedSubmission(submissionId, userId, isAdmin))) {
    return Response.json({ error: "Submission not found." }, { status: 404 });
  }

  const { rows } = await db.query<{
    id: number; kind: string; page: number; paragraph_index: number | null;
    x: number; y: number; color: string; body: string | null; stroke_points: string | null;
    created_by: number; created_at: string;
  }>(
    `SELECT id, kind, page, paragraph_index, x, y, color, body, stroke_points, created_by, created_at
     FROM assignment_annotations WHERE submission_id = $1 ORDER BY created_at ASC`,
    [submissionId]
  );

  return Response.json({
    annotations: rows.map((r) => ({
      id: r.id, kind: r.kind, page: r.page, paragraphIndex: r.paragraph_index,
      x: r.x, y: r.y, color: r.color, body: r.body,
      strokePoints: r.stroke_points, mine: r.created_by === userId, createdAt: r.created_at,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const submissionId = Number(body.submissionId);
  const kind = body.kind;
  const page = Number.isInteger(body.page) ? (body.page as number) : 1;
  const paragraphIndex = Number.isInteger(body.paragraphIndex) ? (body.paragraphIndex as number) : null;
  const x = Number(body.x);
  const y = Number(body.y);
  const color = typeof body.color === "string" ? body.color.slice(0, 20) : "#facc15";
  const text = typeof body.body === "string" ? body.body.trim().slice(0, MAX_BODY_LENGTH) : null;
  const strokePoints = typeof body.strokePoints === "string" ? body.strokePoints.slice(0, MAX_STROKE_POINTS_LENGTH) : null;

  if (
    !Number.isSafeInteger(submissionId) || submissionId < 1 ||
    typeof kind !== "string" || !KINDS.has(kind) ||
    page < 1 || page > 10_000 ||
    !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100 ||
    !/^#[0-9a-f]{3,8}$/i.test(color) ||
    (kind === "comment" && !text) ||
    (kind === "draw" && !strokePoints) ||
    (paragraphIndex !== null && (paragraphIndex < 0 || paragraphIndex > 100_000))
  ) {
    return Response.json({ error: "Invalid annotation." }, { status: 400 });
  }
  if (!(await ownedSubmission(submissionId, userId, isAdmin))) {
    return Response.json({ error: "Submission not found." }, { status: 404 });
  }

  const { rows } = await db.query<{ id: number; created_at: string }>(
    `INSERT INTO assignment_annotations (submission_id, created_by, kind, page, paragraph_index, x, y, color, body, stroke_points)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
    [submissionId, userId, kind, page, paragraphIndex, x, y, color, text, strokePoints]
  );

  return Response.json({
    id: rows[0].id, kind, page, paragraphIndex, x, y, color, body: text,
    strokePoints, mine: true, createdAt: rows[0].created_at,
  });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "A valid id is required." }, { status: 400 });

  // Deletable by whoever created it, or by an admin — not by every tutor
  // with access to the course, so one reviewer can't erase another's notes.
  const { rowCount } = await db.query(
    `DELETE FROM assignment_annotations a
     USING assignment_submissions s, courses c
     WHERE a.id = $1 AND a.submission_id = s.id AND s.course_slug = c.slug
        AND ($3::boolean OR (c.owner_user_id = $2 AND a.created_by = $2))`,
    [id, userId, isAdmin]
  );
  if (!rowCount) return Response.json({ error: "Annotation not found." }, { status: 404 });

  return Response.json({ ok: true });
}
