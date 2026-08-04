import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lessonId = req.nextUrl.searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });

  const { rows } = await db.query<{
    id: number; user_id: number; user_name: string; body: string; created_at: string;
  }>(
    `SELECT id, user_id, user_name, body, created_at
     FROM lesson_comments
     WHERE lesson_id = $1
     ORDER BY created_at DESC`,
    [lessonId]
  );

  return NextResponse.json({ comments: rows });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId, body } = await req.json();
  if (!lessonId || !body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const userName = session.user.name ?? session.user.email.split("@")[0];

  const { rows } = await db.query<{
    id: number; user_id: number; user_name: string; body: string; created_at: string;
  }>(
    `INSERT INTO lesson_comments (user_id, user_name, user_email, lesson_id, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, user_name, body, created_at`,
    [session.user.id, userName, session.user.email, lessonId, body.trim()]
  );

  return NextResponse.json({ comment: rows[0] }, { status: 201 });
}
