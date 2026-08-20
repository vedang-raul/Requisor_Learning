import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { seedCourses } from "@/lib/data";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";

const MAX_BOOKMARKS_PER_REQUEST = 200;
const MAX_BOOKMARK_REQUEST_BYTES = 64 * 1024;
const COURSE_SLUGS = new Set(seedCourses.map((course) => course.slug));
const LESSON_IDS = new Set(seedCourses.flatMap((course) => course.lessons.map((lesson) => lesson.id)));

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidCourseSlug(slug: unknown): slug is string {
  return typeof slug === "string" && COURSE_SLUGS.has(slug);
}

function isValidLessonId(lessonId: unknown): lessonId is string {
  return typeof lessonId === "string" && LESSON_IDS.has(lessonId);
}

async function parseBody(req: Request): Promise<unknown | NextResponse> {
  try {
    return await readJsonBody(req, MAX_BOOKMARK_REQUEST_BYTES);
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

  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }
  const { type, slug, lessonId, action } = body;

  if (action !== "add" && action !== "remove") {
    return NextResponse.json({ error: "action must be 'add' or 'remove'" }, { status: 400 });
  }

  if (type === "course" && isValidCourseSlug(slug)) {
    if (action === "add") {
      await db.query(
        "INSERT INTO course_bookmarks (user_id, course_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [uid, slug]
      );
    } else {
      await db.query("DELETE FROM course_bookmarks WHERE user_id = $1 AND course_slug = $2", [uid, slug]);
    }
  } else if (type === "lesson" && isValidLessonId(lessonId)) {
    if (action === "add") {
      await db.query(
        "INSERT INTO saved_lessons (user_id, lesson_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [uid, lessonId]
      );
    } else {
      await db.query("DELETE FROM saved_lessons WHERE user_id = $1 AND lesson_id = $2", [uid, lessonId]);
    }
  } else {
    return NextResponse.json({ error: "A valid course slug or lesson ID is required" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// PUT /api/bookmarks — bulk insert for migration (local-only → DB)
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  const uid = session?.user?.id;
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await parseBody(req);
  if (body instanceof NextResponse) return body;
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }
  const bookmarks = body.bookmarks === undefined ? [] : body.bookmarks;
  const savedLessons = body.savedLessons === undefined ? [] : body.savedLessons;

  if (!Array.isArray(bookmarks) || !Array.isArray(savedLessons)) {
    return NextResponse.json({ error: "bookmarks and savedLessons must be arrays" }, { status: 400 });
  }
  if (bookmarks.length > MAX_BOOKMARKS_PER_REQUEST || savedLessons.length > MAX_BOOKMARKS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Each bookmark list may contain at most ${MAX_BOOKMARKS_PER_REQUEST} items` },
      { status: 413 }
    );
  }
  if (!bookmarks.every(isValidCourseSlug) || !savedLessons.every(isValidLessonId)) {
    return NextResponse.json({ error: "All bookmarks and saved lessons must reference existing content" }, { status: 400 });
  }

  const uniqueBookmarks = [...new Set(bookmarks)];
  const uniqueSavedLessons = [...new Set(savedLessons)];

  await Promise.all([
    uniqueBookmarks.length > 0
      ? db.query(
          `INSERT INTO course_bookmarks (user_id, course_slug)
           SELECT $1, course_slug
           FROM unnest($2::text[]) AS course_slug
           ON CONFLICT DO NOTHING`,
          [uid, uniqueBookmarks]
        )
      : Promise.resolve(),
    uniqueSavedLessons.length > 0
      ? db.query(
          `INSERT INTO saved_lessons (user_id, lesson_id)
           SELECT $1, lesson_id
           FROM unnest($2::text[]) AS lesson_id
           ON CONFLICT DO NOTHING`,
          [uid, uniqueSavedLessons]
        )
      : Promise.resolve(),
  ]);

  return NextResponse.json({ ok: true });
}
