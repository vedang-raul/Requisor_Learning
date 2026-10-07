import { db } from "@/lib/db";

/**
 * Where lesson transcripts are kept. They live in their own table, keyed by
 * lesson id, because saving a course rewrites its lesson rows and because a
 * transcript is far too large to send with the course list.
 */
export type TranscriptSource = "manual" | "youtube";

export async function getLessonTranscript(lessonId: string): Promise<{ transcript: string; source: TranscriptSource } | null> {
  const { rows } = await db.query<{ transcript: string; source: string }>(
    "SELECT transcript, source FROM lesson_transcripts WHERE lesson_id = $1",
    [lessonId]
  );
  if (!rows[0]) return null;
  return { transcript: rows[0].transcript, source: rows[0].source === "youtube" ? "youtube" : "manual" };
}

/** Saves the transcript, or removes it when the text is empty. */
export async function saveLessonTranscript(lessonId: string, transcript: string, source: TranscriptSource, userId: number): Promise<void> {
  if (!transcript) {
    await db.query("DELETE FROM lesson_transcripts WHERE lesson_id = $1", [lessonId]);
    return;
  }
  await db.query(
    `INSERT INTO lesson_transcripts (lesson_id, transcript, source, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (lesson_id) DO UPDATE SET transcript = EXCLUDED.transcript, source = EXCLUDED.source,
       updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [lessonId, transcript, source, userId]
  );
}

/** A tutor may edit the transcript of a lesson in a course they own; an admin, any lesson. */
export async function canManageLesson(lessonId: string, userId: number, isAdmin: boolean): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM course_lessons l JOIN courses c ON c.slug = l.course_slug
     WHERE l.id = $1 AND ($2::boolean OR c.owner_user_id = $3)`,
    [lessonId, isAdmin, userId]
  );
  return rows.length > 0;
}
