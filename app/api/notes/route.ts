import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/notes — return all notes for the signed-in user
export async function GET() {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query<{ lesson_id: string; content: string }>(
    "SELECT lesson_id, content FROM lesson_notes WHERE user_id = $1",
    [uid]
  );

  const notes: Record<string, string> = {};
  for (const row of rows) notes[row.lesson_id] = row.content;
  return NextResponse.json({ notes });
}

// POST /api/notes — upsert a single lesson note
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { lessonId?: string; content?: string };
  const { lessonId, content } = body;
  if (!lessonId) return NextResponse.json({ error: "lessonId required" }, { status: 400 });

  await db.query(
    `INSERT INTO lesson_notes (user_id, lesson_id, content, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, lesson_id)
     DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
    [uid, lessonId, content ?? ""]
  );

  return NextResponse.json({ ok: true });
}

// PUT /api/notes — bulk upsert for migration (local → DB)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { notes?: Record<string, string> };
  const notes = body.notes ?? {};
  const entries = Object.entries(notes).filter(([, txt]) => txt);
  if (entries.length === 0) return NextResponse.json({ ok: true });

  await Promise.all(
    entries.map(([lessonId, content]) =>
      db.query(
        `INSERT INTO lesson_notes (user_id, lesson_id, content, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, lesson_id)
         DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
        [uid, lessonId, content]
      )
    )
  );

  return NextResponse.json({ ok: true });
}
