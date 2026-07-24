import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lessonId, courseSlug } = await req.json();
  if (!lessonId || !courseSlug) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  await db.query(
    `INSERT INTO lesson_completions (user_id, lesson_id, course_slug)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET completed_at = NOW()`,
    [session.user.id, lessonId, courseSlug]
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lessonId } = await req.json();
  if (!lessonId) return NextResponse.json({ error: "Missing lessonId" }, { status: 400 });

  await db.query(
    `DELETE FROM lesson_completions WHERE user_id = $1 AND lesson_id = $2`,
    [session.user.id, lessonId]
  );

  return NextResponse.json({ ok: true });
}
