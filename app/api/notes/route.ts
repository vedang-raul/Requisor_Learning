import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedCourses } from "@/lib/data";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";

const MAX_NOTE_CONTENT_LENGTH = 50_000;
const MAX_NOTES_PER_REQUEST = 200;
const MAX_NOTES_PER_USER = 200;
const MAX_NOTES_REQUEST_BYTES = 5 * 1024 * 1024;
const LESSON_IDS = new Set(seedCourses.flatMap((course) => course.lessons.map((lesson) => lesson.id)));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidNote(lessonId: unknown, content: unknown): lessonId is string {
  return typeof lessonId === "string"
    && LESSON_IDS.has(lessonId)
    && typeof content === "string"
    && content.length <= MAX_NOTE_CONTENT_LENGTH;
}

function isValidNoteEntry(entry: [string, unknown]): entry is [string, string] {
  return isValidNote(entry[0], entry[1]);
}

async function parseBody(req: Request): Promise<unknown | NextResponse> {
  try {
    return await readJsonBody(req, MAX_NOTES_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }
    throw error;
  }
}

async function upsertNotes(
  uid: string,
  entries: Array<[lessonId: string, content: string]>
): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // Serialize note-count checks for this user so concurrent requests cannot
    // bypass the per-user row limit.
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [uid]);

    const lessonIds = entries.map(([lessonId]) => lessonId);
    const countResult = await client.query<{ total: number; existing: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE lesson_id = ANY($2::text[]))::int AS existing
       FROM lesson_notes
       WHERE user_id = $1`,
      [uid, lessonIds]
    );
    const total = Number(countResult.rows[0]?.total ?? 0);
    const existing = Number(countResult.rows[0]?.existing ?? 0);
    if (total - existing + entries.length > MAX_NOTES_PER_USER) {
      await client.query("ROLLBACK");
      return false;
    }

    await client.query(
      `INSERT INTO lesson_notes (user_id, lesson_id, content, updated_at)
       SELECT $1, lesson_id, content
       FROM unnest($2::text[], $3::text[]) AS note(lesson_id, content)
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [uid, lessonIds, entries.map(([, content]) => content)]
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

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

  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }
  const { lessonId, content } = body;
  if (content !== undefined && typeof content !== "string") {
    return NextResponse.json(
      { error: `A valid lesson ID and note of at most ${MAX_NOTE_CONTENT_LENGTH} characters are required` },
      { status: 400 }
    );
  }
  const noteContent = content ?? "";
  if (!isValidNote(lessonId, noteContent)) {
    return NextResponse.json(
      { error: `A valid lesson ID and note of at most ${MAX_NOTE_CONTENT_LENGTH} characters are required` },
      { status: 400 }
    );
  }

  const saved = await upsertNotes(uid, [[lessonId, noteContent]]);
  if (!saved) {
    return NextResponse.json({ error: "You have reached the maximum number of saved notes" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

// PUT /api/notes — bulk upsert for migration (local → DB)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;
  if (!isRecord(body) || !isRecord(body.notes)) {
    return NextResponse.json({ error: "notes must be an object" }, { status: 400 });
  }

  const entries = Object.entries(body.notes);
  if (entries.length > MAX_NOTES_PER_REQUEST) {
    return NextResponse.json(
      { error: `A notes migration may contain at most ${MAX_NOTES_PER_REQUEST} items` },
      { status: 413 }
    );
  }
  if (!entries.every(isValidNoteEntry)) {
    return NextResponse.json(
      { error: `All notes must reference existing lessons and contain at most ${MAX_NOTE_CONTENT_LENGTH} characters` },
      { status: 400 }
    );
  }

  const nonEmptyEntries = entries
    .filter(isValidNoteEntry)
    .filter(([, content]) => content !== "");
  if (nonEmptyEntries.length === 0) return NextResponse.json({ ok: true });

  const saved = await upsertNotes(uid, nonEmptyEntries);
  if (!saved) {
    return NextResponse.json({ error: "You have reached the maximum number of saved notes" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
