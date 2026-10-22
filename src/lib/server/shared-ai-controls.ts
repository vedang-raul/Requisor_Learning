import { createHash } from "node:crypto";
import { db } from "./db";

/**
 * One atomic upsert serializes concurrent requests for the same route/account.
 * Use database time, not worker clocks. Expired counters are reused in place;
 * a bounded sweep also removes counters for accounts that stop making requests.
 */
export async function checkSharedRateLimit(scope: string, key: string, max: number, windowMs: number) {
  const accountKey = createHash("sha256").update(key.trim().toLowerCase()).digest("hex");
  try {
    const { rows } = await db.query<{ allowed: boolean; retry_ms: number }>(
      `WITH sweep AS (
         DELETE FROM ai_rate_limits WHERE (scope, account_key) IN (
           SELECT scope, account_key FROM ai_rate_limits
           WHERE reset_at < statement_timestamp() - interval '1 day'
             AND NOT (scope = $1 AND account_key = $2)
           ORDER BY reset_at, scope, account_key
           LIMIT 100 FOR UPDATE SKIP LOCKED
         ) AND reset_at < statement_timestamp() - interval '1 day'
       )
       INSERT INTO ai_rate_limits AS quota (scope, account_key, count, reset_at)
       VALUES ($1, $2, 1, statement_timestamp() + $4 * interval '1 millisecond')
       ON CONFLICT (scope, account_key) DO UPDATE
       SET count = CASE WHEN quota.reset_at <= statement_timestamp() THEN 1 ELSE quota.count + 1 END,
           reset_at = CASE WHEN quota.reset_at <= statement_timestamp()
             THEN statement_timestamp() + $4 * interval '1 millisecond' ELSE quota.reset_at END
       WHERE quota.reset_at <= statement_timestamp() OR quota.count < $3
       RETURNING true AS allowed, 0 AS retry_ms`,
      [scope, accountKey, max, windowMs]
    );
    if (rows[0]?.allowed) return { limited: false, retryAfterMs: 0 };
    const result = await db.query<{ retry_ms: number }>(
      `SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (reset_at - statement_timestamp())) * 1000)) AS retry_ms
       FROM ai_rate_limits WHERE scope = $1 AND account_key = $2`,
      [scope, accountKey]
    );
    return { limited: true, retryAfterMs: Number(result.rows[0]?.retry_ms) || windowMs };
  } catch {
    // Never fall back to a worker-local quota when shared storage is unavailable.
    console.error("[ai-controls] Shared quota unavailable; refusing AI request");
    return { limited: true, retryAfterMs: 5_000 };
  }
}
