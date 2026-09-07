export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/** The signed-in user's own server-side notifications. GET lists the most
 *  recent ones; PATCH marks one (by id) or all of them read. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { rows: userRows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  const { rows } = await db.query<{
    id: number; kind: string; title: string; body: string; link: string | null; read: boolean; created_at: string;
  }>(
    "SELECT id, kind, title, body, link, read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [user.id]
  );

  return Response.json({
    notifications: rows.map((r) => ({
      id: r.id, kind: r.kind, title: r.title, body: r.body, link: r.link, read: r.read, at: r.created_at,
    })),
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { rows: userRows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  const body = await req.json().catch(() => ({})) as { id?: unknown };
  if (body.id !== undefined) {
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid id." }, { status: 400 });
    await db.query("UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2", [id, user.id]);
  } else {
    await db.query("UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE", [user.id]);
  }

  return Response.json({ ok: true });
}
