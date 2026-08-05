import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db, ADMIN_EMAIL } from "@/lib/db";

function isAdmin(email: string) {
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status"); // optional filter
  const withMedia = req.nextUrl.searchParams.get("id");  // single report with media

  // Single report detail (includes media_data)
  if (withMedia) {
    const { rows } = await db.query(
      `SELECT id, user_name, user_email, title, description, media_data, media_type,
              occurred_at, status, admin_note, created_at
       FROM bug_reports WHERE id = $1`,
      [withMedia]
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ report: rows[0] });
  }

  // List (no media_data to keep payload small)
  const { rows } = await db.query(
    `SELECT id, user_name, user_email, title, description, media_type,
            occurred_at, status, admin_note, created_at
     FROM bug_reports
     ${status ? "WHERE status = $1" : ""}
     ORDER BY created_at DESC`,
    status ? [status] : []
  );

  return NextResponse.json({ reports: rows });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { id, status, adminNote } =
    body as { id?: number; status?: string; adminNote?: string };

  if (!id) return NextResponse.json({ error: "id is required." }, { status: 400 });
  if (!["open", "in_progress", "resolved"].includes(status ?? "")) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { rows } = await db.query(
    `UPDATE bug_reports SET status = $1, admin_note = $2 WHERE id = $3
     RETURNING id, status, admin_note`,
    [status, adminNote ?? null, id]
  );
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ report: rows[0] });
}
