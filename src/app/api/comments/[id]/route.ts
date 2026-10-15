import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { canManageCourse } from "@/lib/server/course-scope";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const commentId = parseInt(id);
  if (isNaN(commentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { rows } = await db.query<{ user_id: number; university_id: number | null }>(
    `SELECT lc.user_id, c.university_id FROM lesson_comments lc
       LEFT JOIN course_lessons l ON l.id = lc.lesson_id
       LEFT JOIN courses c ON c.slug = l.course_slug
      WHERE lc.id = $1`,
    [commentId]
  );
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A super admin, or the admin of the university whose course it is.
  const isAdmin = canManageCourse(session.user, rows[0].university_id);
  const isOwner = String(rows[0].user_id) === String(session.user.id);
  if (!isAdmin && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.query(`DELETE FROM lesson_comments WHERE id = $1`, [commentId]);
  return NextResponse.json({ ok: true });
}
