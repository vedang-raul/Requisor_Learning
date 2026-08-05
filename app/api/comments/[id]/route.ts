import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db, ADMIN_EMAIL } from "@/lib/db";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const commentId = parseInt(id);
  if (isNaN(commentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { rows } = await db.query<{ user_id: number }>(
    `SELECT user_id FROM lesson_comments WHERE id = $1`,
    [commentId]
  );
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = session.user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const isOwner = String(rows[0].user_id) === String(session.user.id);
  if (!isAdmin && !isOwner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await db.query(`DELETE FROM lesson_comments WHERE id = $1`, [commentId]);
  return NextResponse.json({ ok: true });
}
