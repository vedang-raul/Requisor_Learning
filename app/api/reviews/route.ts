import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const MAX_COMMENT_LENGTH = 1000;

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

  let courseSlug: string | undefined;
  let rating: unknown;
  let comment: unknown;
  try {
    ({ courseSlug, rating, comment } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const clamped = Math.round(Number(rating));
  if (!courseSlug || !Number.isFinite(clamped) || clamped < 1 || clamped > 5) {
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

  // One review per user per course — posting again updates the existing review
  const { rows } = await db.query<ReviewRow>(
    `INSERT INTO course_reviews (user_id, user_name, user_email, course_slug, rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, course_slug) DO UPDATE
       SET rating      = EXCLUDED.rating,
           comment     = EXCLUDED.comment,
           user_name   = EXCLUDED.user_name,
           created_at  = NOW()
     RETURNING id, user_name, course_slug, rating, comment, created_at`,
    [session.user.id, userName, session.user.email, courseSlug, clamped, trimmedComment]
  );

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
