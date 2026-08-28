import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureCourseCatalog } from "@/lib/course-catalog";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";

const MAX_COMMENT_LENGTH = 1000;
const MAX_REVIEW_BODY_BYTES = 8_192;
const COURSE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ReviewRow {
  id: number;
  user_name: string;
  course_slug: string;
  rating: number;
  comment: string;
  created_at: string;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "employee" && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const courseSlug = req.nextUrl.searchParams.get("courseSlug");
  if (!courseSlug) return NextResponse.json({ error: "Missing courseSlug" }, { status: 400 });

  // Expose whether the current user has already reviewed this course
  const { rows } = await db.query<ReviewRow & { is_own: boolean }>(
    `SELECT id, user_name, course_slug, rating, comment, created_at,
            (user_id = $2) AS is_own
     FROM course_reviews
     WHERE course_slug = $1
     ORDER BY created_at DESC`,
    [courseSlug, session.user.id]
  );

  // Omit user_id to avoid leaking internal DB identifiers
  const reviews = rows.map(({ id, user_name, course_slug, rating, comment, created_at, is_own }) => ({
    id,
    user_name,
    course_slug,
    rating,
    comment,
    created_at,
    is_own,
  }));

  return NextResponse.json({ reviews });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "employee" && session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_REVIEW_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { courseSlug, rating, comment } = body as Record<string, unknown>;

  const clamped = Math.round(Number(rating));
  if (
    typeof courseSlug !== "string" ||
    courseSlug.length > 80 ||
    !COURSE_SLUG_PATTERN.test(courseSlug) ||
    !Number.isFinite(clamped) ||
    clamped < 1 ||
    clamped > 5
  ) {
    return NextResponse.json({ error: "A course and a 1–5 star rating are required." }, { status: 400 });
  }

  const trimmedComment = (typeof comment === "string" ? comment : "").trim();
  if (trimmedComment.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `Review comment must be ${MAX_COMMENT_LENGTH} characters or fewer.` },
      { status: 422 }
    );
  }

  const userName = session.user.name ?? session.user.email.split("@")[0];

  await ensureCourseCatalog();
  // Lock an extant course while inserting. This prevents a legacy schema
  // (before its FK upgrade) from accepting a review during a course delete.
  const { rows } = await db.query<ReviewRow>(
    `WITH course AS (
       SELECT slug FROM courses WHERE slug = $4 FOR KEY SHARE
     )
     INSERT INTO course_reviews (user_id, user_name, user_email, course_slug, rating, comment)
     SELECT $1, $2, $3, slug, $5, $6 FROM course
     ON CONFLICT (user_id, course_slug) DO UPDATE
       SET rating      = EXCLUDED.rating,
           comment     = EXCLUDED.comment,
           user_name   = EXCLUDED.user_name,
           created_at  = NOW()
     RETURNING id, user_name, course_slug, rating, comment, created_at`,
    [session.user.id, userName, session.user.email, courseSlug, clamped, trimmedComment]
  );

  if (!rows[0]) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  return NextResponse.json({ review: rows[0] }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const reviewId = req.nextUrl.searchParams.get("id");
  if (!reviewId) return NextResponse.json({ error: "Missing review id" }, { status: 400 });

  const isAdmin =
    session.user.email === process.env.ADMIN_EMAIL || session.user.email === "support@requisor.io";

  const { rowCount } = await db.query(
    isAdmin
      ? `DELETE FROM course_reviews WHERE id = $1`
      : `DELETE FROM course_reviews WHERE id = $1 AND user_id = $2`,
    isAdmin ? [reviewId] : [reviewId, session.user.id]
  );

  if (!rowCount) {
    return NextResponse.json(
      { error: "Review not found or you don't have permission to delete it." },
      { status: 404 }
    );
  }

  return new NextResponse(null, { status: 204 });
}
