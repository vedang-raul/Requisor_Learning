export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { AI_FEATURES, type AiFeature } from "@/lib/ai/usage";

/**
 * The signed-in person's own use of the AI services.
 *   GET ?days=7|30|90|365  ->  { days, since, totals, features, daily }
 * Only their own usage; there is no way to ask about someone else.
 */
const PERIODS = [7, 30, 90, 365];

type FeatureRow = { feature: string; requests: string; input_tokens: string; output_tokens: string; units: string; unit: string };
type DayRow = { day: string; tokens: string };

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const asked = Number(new URL(req.url).searchParams.get("days"));
  const days = PERIODS.includes(asked) ? asked : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60_000);

  const [byFeature, byDay] = await Promise.all([
    db.query<FeatureRow>(
      `SELECT feature, unit, COUNT(*) AS requests, COALESCE(SUM(input_tokens), 0) AS input_tokens,
              COALESCE(SUM(output_tokens), 0) AS output_tokens, COALESCE(SUM(units), 0) AS units
         FROM ai_usage WHERE user_id = $1 AND created_at >= $2
        GROUP BY feature, unit`,
      [userId, since]
    ),
    db.query<DayRow>(
      `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
         FROM ai_usage WHERE user_id = $1 AND created_at >= $2 AND unit = ''
        GROUP BY 1 ORDER BY 1`,
      [userId, since]
    ),
  ]);

  const features = byFeature.rows
    .map((r) => ({
      feature: r.feature,
      label: AI_FEATURES[r.feature as AiFeature] ?? r.feature,
      requests: Number(r.requests),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      units: Number(r.units),
      unit: r.unit,
    }))
    .sort((a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens) || b.units - a.units);
  const sum = (pick: (f: (typeof features)[number]) => number) => features.reduce((total, f) => total + pick(f), 0);
  const unitTotal = (unit: string) => sum((f) => (f.unit === unit ? f.units : 0));

  return Response.json({
    days,
    since: since.toISOString(),
    totals: {
      inputTokens: sum((f) => f.inputTokens),
      outputTokens: sum((f) => f.outputTokens),
      requests: sum((f) => f.requests),
      voiceCharacters: unitTotal("characters"),
      recordings: unitTotal("recordings"),
      videoSeconds: unitTotal("seconds"),
    },
    features,
    daily: byDay.rows.map((r) => ({ day: r.day, tokens: Number(r.tokens) })),
  }, { headers: { "Cache-Control": "no-store" } });
}
