import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { createRateLimiter, rateLimitResponse } from "@/lib/server/rate-limit";
import {
  MAX_BUG_REPORT_BODY_BYTES, MAX_BUG_REPORTS, MAX_BUG_REPORTS_PER_DAY,
  MAX_BUG_STORED_MEDIA_BYTES, validBugReportMedia,
} from "@/lib/server/bug-report-limits";

const MAX_TITLE = 200;
const MAX_DESC = 5000;
const reportLimiter = createRateLimiter(5, 60_000);

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = session.user.email.toLowerCase();
  const { limited, retryAfterMs } = reportLimiter.check(email);
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  // Resolve user row
  const userRes = await db.query<{ id: number; name: string }>(
    `SELECT id, name FROM users WHERE email = $1`,
    [email]
  );
  if (!userRes.rows.length) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const { id: userId, name: userName } = userRes.rows[0];

  let body: unknown;
  try { body = await readJsonBody(req, MAX_BUG_REPORT_BODY_BYTES); } catch (err) {
    return NextResponse.json({ error: err instanceof RequestBodyTooLargeError ? "Request body too large." : "Invalid JSON" },
      { status: err instanceof RequestBodyTooLargeError ? 413 : 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const { title, description, mediaData, mediaType, occurredAt } =
    body as { title?: string; description?: string; mediaData?: string; mediaType?: string; occurredAt?: string };

  if (typeof title !== "string" || !title.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (typeof description !== "string" || !description.trim()) return NextResponse.json({ error: "Description is required." }, { status: 400 });
  if (typeof occurredAt !== "string" || occurredAt.length > 64 || !occurredAt) return NextResponse.json({ error: "Date and time is required." }, { status: 400 });

  if (title.length > MAX_TITLE) return NextResponse.json({ error: `Title must be ≤ ${MAX_TITLE} characters.` }, { status: 400 });
  if (description.length > MAX_DESC) return NextResponse.json({ error: `Description must be ≤ ${MAX_DESC} characters.` }, { status: 400 });
  if (mediaData != null && !validBugReportMedia(mediaData, mediaType)) {
    return NextResponse.json({ error: "Invalid media. Attach a supported image or video up to 4 MB." }, { status: 400 });
  }

  const occurredDate = new Date(occurredAt);
  if (isNaN(occurredDate.getTime())) return NextResponse.json({ error: "Invalid date/time." }, { status: 400 });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Serialize quota checks and insertion per user across all workers.
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const { rows: usage } = await client.query<{ count: string; daily: string; bytes: string }>(
      `SELECT COUNT(*) AS count,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS daily,
              COALESCE(SUM(octet_length(media_data)), 0) AS bytes
       FROM bug_reports WHERE user_id = $1`, [userId]
    );
    if (Number(usage[0].count) >= MAX_BUG_REPORTS ||
        Number(usage[0].daily) >= MAX_BUG_REPORTS_PER_DAY ||
        Number(usage[0].bytes) + Buffer.byteLength(mediaData ?? "", "utf8") > MAX_BUG_STORED_MEDIA_BYTES) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Bug report quota reached. Please contact support if you need to submit another report." }, { status: 429 });
    }
    const { rows } = await client.query<{ id: number; created_at: string }>(
      `INSERT INTO bug_reports (user_id, user_name, user_email, title, description, media_data, media_type, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [userId, userName, email, title.trim(), description.trim(),
       mediaData ?? null, mediaData ? mediaType : null, occurredDate]
    );

    await client.query("COMMIT");
    return NextResponse.json({ report: rows[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query(
    `SELECT id, title, description, media_type, occurred_at, status, created_at
     FROM bug_reports
     WHERE user_email = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [session.user.email.toLowerCase(), MAX_BUG_REPORTS]
  );

  return NextResponse.json({ reports: rows });
}
