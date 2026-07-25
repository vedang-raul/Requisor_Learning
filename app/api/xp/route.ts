import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query(
    "SELECT xp, streak_count, streak_last_day FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  if (!rows[0]) return NextResponse.json({ xp: 0, streakCount: 0, streakLastDay: "" });

  const row = rows[0] as { xp: number; streak_count: number; streak_last_day: Date | null };
  return NextResponse.json({
    xp: row.xp ?? 0,
    streakCount: row.streak_count ?? 0,
    streakLastDay: row.streak_last_day ? new Date(row.streak_last_day).toISOString().slice(0, 10) : "",
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { xp, streakCount, streakLastDay } = (await req.json()) as {
    xp: number;
    streakCount: number;
    streakLastDay: string;
  };

  await db.query(
    "UPDATE users SET xp = $1, streak_count = $2, streak_last_day = $3 WHERE email = $4",
    [xp ?? 0, streakCount ?? 0, streakLastDay || null, session.user.email.toLowerCase()]
  );

  return NextResponse.json({ ok: true });
}
