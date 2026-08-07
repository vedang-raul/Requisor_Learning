import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export interface LeaderboardEntry {
  rank: number;
  name: string;
  xp: number;
  isSelf: boolean;
}

export interface LeaderboardResponse {
  top: LeaderboardEntry[];
  /** Populated only when the caller is not in the top-10. */
  self: LeaderboardEntry | null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id ? Number(session.user.id) : null;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rank all non-admin users with XP > 0; ties broken by most-recent login.
  const { rows } = await db.query<{
    id: number;
    display_name: string;
    xp: number;
    rank: string; // bigint comes back as string from pg
  }>(`
    WITH ranked AS (
      SELECT
        id,
        COALESCE(NULLIF(TRIM(name), ''), SPLIT_PART(email, '@', 1)) AS display_name,
        xp,
        ROW_NUMBER() OVER (
          ORDER BY xp DESC,
                   last_login_at DESC NULLS LAST,
                   id ASC
        ) AS rank
      FROM users
      WHERE role = 'employee'
        AND xp > 0
    )
    SELECT * FROM ranked WHERE rank <= 10 OR id = $1
    ORDER BY rank
  `, [uid]);

  const top: LeaderboardEntry[] = [];
  let self: LeaderboardEntry | null = null;
  let selfInTop10 = false;

  for (const row of rows) {
    const rank = Number(row.rank);
    const entry: LeaderboardEntry = {
      rank,
      name: row.display_name,
      xp: row.xp,
      isSelf: row.id === uid,
    };
    if (rank <= 10) {
      top.push(entry);
      if (row.id === uid) selfInTop10 = true;
    } else if (row.id === uid) {
      self = entry;
    }
  }

  // If caller has 0 XP they won't appear above — attach their info anyway.
  if (!selfInTop10 && !self) {
    const { rows: meRows } = await db.query<{
      display_name: string;
      xp: number;
      rank: string;
    }>(`
      WITH ranked AS (
        SELECT
          id,
          COALESCE(NULLIF(TRIM(name), ''), SPLIT_PART(email, '@', 1)) AS display_name,
          xp,
          ROW_NUMBER() OVER (
            ORDER BY xp DESC,
                     last_login_at DESC NULLS LAST,
                     id ASC
          ) AS rank
        FROM users
        WHERE role = 'employee'
      )
      SELECT * FROM ranked WHERE id = $1
    `, [uid]);
    if (meRows[0]) {
      self = {
        rank: Number(meRows[0].rank),
        name: meRows[0].display_name,
        xp: meRows[0].xp,
        isSelf: true,
      };
    }
  }

  return NextResponse.json({ top, self: selfInTop10 ? null : self } satisfies LeaderboardResponse);
}
