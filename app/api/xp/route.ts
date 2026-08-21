import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// XP reads are user-specific and change after lesson completions.
// A short private cache avoids redundant DB hits on rapid page navigations
// without ever serving a stale XP value for longer than 10 s.
const XP_GET_CACHE = "private, max-age=10, stale-while-revalidate=30";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query(
    "SELECT xp FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  if (!rows[0]) return NextResponse.json({ xp: 0 }, { headers: { "Cache-Control": XP_GET_CACHE } });

  const row = rows[0] as { xp: number };
  return NextResponse.json(
    { xp: row.xp ?? 0 },
    { headers: { "Cache-Control": XP_GET_CACHE } }
  );
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { xp } = (await req.json()) as { xp: number };

  await db.query(
    "UPDATE users SET xp = $1 WHERE email = $2",
    [xp ?? 0, session.user.email.toLowerCase()]
  );

  return NextResponse.json({ ok: true });
}
