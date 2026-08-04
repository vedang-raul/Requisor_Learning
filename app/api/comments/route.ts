import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const MAX_BODY_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lessonId = req.nextUrl.searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });

  // Pagination: ?page=1&pageSize=20
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10))
  );
  const offset = (page - 1) * pageSize;

  const { rows } = await db.query<{
    id: number;
    user_name: string;
    body: string;
    created_at: string;
    total: string;
  }>(
    `SELECT id, user_name, body, created_at, COUNT(*) OVER() AS total
     FROM lesson_comments
     WHERE lesson_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [lessonId, pageSize, offset]
  );

  const total = rows.length > 0 ? parseInt(rows[0].total, 10) : 0;

  // Omit user_id to avoid leaking internal DB identifiers
  const comments = rows.map(({ id, user_name, body, created_at }) => ({
    id,
    user_name,
    body,
    created_at,
  }));

  return NextResponse.json({ comments, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let lessonId: string | undefined;
  let body: string | undefined;
  try {
    ({ lessonId, body } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!lessonId || !body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const trimmedBody = body.trim();
  if (trimmedBody.length > MAX_BODY_LENGTH) {
    return NextResponse.json(
      { error: `Comment must be ${MAX_BODY_LENGTH} characters or fewer.` },
      { status: 422 }
    );
  }

  const userName = session.user.name ?? session.user.email.split("@")[0];

  const { rows } = await db.query<{
    id: number;
    user_name: string;
    body: string;
    created_at: string;
  }>(
    `INSERT INTO lesson_comments (user_id, user_name, user_email, lesson_id, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_name, body, created_at`,
    [session.user.id, userName, session.user.email, lessonId, trimmedBody]
  );

  return NextResponse.json({ comment: rows[0] }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const commentId = req.nextUrl.searchParams.get("id");
  if (!commentId) return NextResponse.json({ error: "Missing comment id" }, { status: 400 });

  // Users can only delete their own comments; admins can delete any
  const isAdmin = session.user.email === process.env.ADMIN_EMAIL || session.user.email === "support@requisor.io";

  const { rowCount } = await db.query(
    isAdmin
      ? `DELETE FROM lesson_comments WHERE id = $1`
      : `DELETE FROM lesson_comments WHERE id = $1 AND user_id = $2`,
    isAdmin ? [commentId] : [commentId, session.user.id]
  );

  if (!rowCount) {
    return NextResponse.json(
      { error: "Comment not found or you don't have permission to delete it." },
      { status: 404 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
