import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const MAX_TITLE = 200;
const MAX_DESC = 5000;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024; // 4 MB base64 string

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Resolve user row
  const userRes = await db.query<{ id: number; name: string }>(
    `SELECT id, name FROM users WHERE email = $1`,
    [session.user.email]
  );
  if (!userRes.rows.length) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const { id: userId, name: userName } = userRes.rows[0];

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { title, description, mediaData, mediaType, occurredAt } =
    body as { title?: string; description?: string; mediaData?: string; mediaType?: string; occurredAt?: string };

  if (!title?.trim()) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!description?.trim()) return NextResponse.json({ error: "Description is required." }, { status: 400 });
  if (!occurredAt) return NextResponse.json({ error: "Date and time is required." }, { status: 400 });

  if (title.length > MAX_TITLE) return NextResponse.json({ error: `Title must be ≤ ${MAX_TITLE} characters.` }, { status: 400 });
  if (description.length > MAX_DESC) return NextResponse.json({ error: `Description must be ≤ ${MAX_DESC} characters.` }, { status: 400 });
  if (mediaData && mediaData.length > MAX_MEDIA_BYTES) return NextResponse.json({ error: "Media file is too large (max 4 MB)." }, { status: 400 });
  if (mediaData && !["image", "video"].includes(mediaType ?? "")) {
    return NextResponse.json({ error: "Invalid media type." }, { status: 400 });
  }

  const occurredDate = new Date(occurredAt);
  if (isNaN(occurredDate.getTime())) return NextResponse.json({ error: "Invalid date/time." }, { status: 400 });

  const { rows } = await db.query<{ id: number; created_at: string }>(
    `INSERT INTO bug_reports (user_id, user_name, user_email, title, description, media_data, media_type, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [userId, userName, session.user.email, title.trim(), description.trim(),
     mediaData ?? null, mediaData ? mediaType : null, occurredDate]
  );

  return NextResponse.json({ report: rows[0] }, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query(
    `SELECT id, title, description, media_type, occurred_at, status, created_at
     FROM bug_reports
     WHERE user_email = $1
     ORDER BY created_at DESC`,
    [session.user.email]
  );

  return NextResponse.json({ reports: rows });
}
