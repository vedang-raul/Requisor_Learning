import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/bookmarks — return course bookmarks + saved lessons for the signed-in user
export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [bkRes, slRes] = await Promise.all([
    db.query<{ course_slug: string }>(
      "SELECT course_slug FROM course_bookmarks WHERE user_id = $1",
      [uid]
    ),
    db.query<{ lesson_id: string }>(
      "SELECT lesson_id FROM saved_lessons WHERE user_id = $1",
      [uid]
    ),
  ]);

  return NextResponse.json({
    bookmarks: bkRes.rows.map((r) => r.course_slug),
    savedLessons: slRes.rows.map((r) => r.lesson_id),
  });
}

// POST /api/bookmarks — explicit add or remove (no server-side toggle)
// Body: { type: "course", slug, action: "add" | "remove" }
//    or { type: "lesson", lessonId, action: "add" | "remove" }
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { type?: string; slug?: string; lessonId?: string; action?: string };
  const { type, slug, lessonId, action } = body;

  if (action !== "add" && action !== "remove") {
    return NextResponse.json({ error: "action must be 'add' or 'remove'" }, { status: 400 });
  }

  if (type === "course" && slug) {
    if (action === "add") {
      await db.query(
        "INSERT INTO course_bookmarks (user_id, course_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [uid, slug]
      );
    } else {
      await db.query("DELETE FROM course_bookmarks WHERE user_id = $1 AND course_slug = $2", [uid, slug]);
    }
  } else if (type === "lesson" && lessonId) {
    if (action === "add") {
      await db.query(
        "INSERT INTO saved_lessons (user_id, lesson_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [uid, lessonId]
      );
    } else {
      await db.query("DELETE FROM saved_lessons WHERE user_id = $1 AND lesson_id = $2", [uid, lessonId]);
    }
  } else {
    return NextResponse.json({ error: "type (course|lesson) and slug/lessonId required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// PUT /api/bookmarks — bulk insert for migration (local-only → DB)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { bookmarks?: string[]; savedLessons?: string[] };

  await Promise.all([
    ...(body.bookmarks ?? []).map((slug) =>
      db.query(
        "INSERT INTO course_bookmarks (user_id, course_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [uid, slug]
      )
    ),
    ...(body.savedLessons ?? []).map((lessonId) =>
      db.query(
        "INSERT INTO saved_lessons (user_id, lesson_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [uid, lessonId]
      )
    ),
  ]);

  return NextResponse.json({ ok: true });
}
