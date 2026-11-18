import { db } from "@/lib/server/db";

type FreeTierUser = { universityId?: number | null; pending?: boolean | null };

/** True for unaffiliated users who have never been connected to a university. */
export function isFreeTier(user: FreeTierUser): boolean {
  return user.universityId == null && !user.pending;
}

type CapResult = { allowed: true } | { allowed: false; resetAt: string | null };

/**
 * Checks whether a free-tier user is within their daily/lifetime AI caps.
 * Caps are defined per the Free Tier Plan (plans/we-have-to-build-iterative-riddle.md).
 *
 * feature "assistant": 10 messages / day (counts rows in ai_usage)
 * feature "quiz":      3 / day
 * feature "voice":     3,000 chars / day AND 15,000 chars lifetime
 *
 * Returns { allowed: true } or { allowed: false, resetAt } where resetAt is
 * midnight UTC tonight for daily caps, null for the lifetime TTS cap.
 */
export async function checkFreeTierCap(userId: number, feature: "assistant" | "quiz" | "voice", amount: number): Promise<CapResult> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60_000);
  const resetAt = tomorrowStart.toISOString();

  if (feature === "assistant") {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ai_usage
       WHERE user_id = $1 AND feature = 'assistant' AND unit = '' AND created_at >= $2`,
      [userId, todayStart]
    );
    if (Number(rows[0]?.count ?? 0) >= 10) return { allowed: false, resetAt };
    return { allowed: true };
  }

  if (feature === "quiz") {
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ai_usage
       WHERE user_id = $1 AND feature = 'quiz' AND created_at >= $2`,
      [userId, todayStart]
    );
    if (Number(rows[0]?.count ?? 0) >= 3) return { allowed: false, resetAt };
    return { allowed: true };
  }

  // voice: check daily cap first, then lifetime cap
  const { rows: dailyRows } = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(units), 0) AS total FROM ai_usage
     WHERE user_id = $1 AND feature = 'voice' AND unit = 'characters' AND created_at >= $2`,
    [userId, todayStart]
  );
  if (Number(dailyRows[0]?.total ?? 0) + amount > 3_000) return { allowed: false, resetAt };

  const { rows: lifetimeRows } = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(units), 0) AS total FROM ai_usage
     WHERE user_id = $1 AND feature = 'voice' AND unit = 'characters'`,
    [userId]
  );
  if (Number(lifetimeRows[0]?.total ?? 0) + amount > 15_000) return { allowed: false, resetAt: null };

  return { allowed: true };
}
