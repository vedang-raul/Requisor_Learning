import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

interface ReviewRow {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
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

  const { rows } = await db.query<ReviewRow>(
    `SELECT id, user_id, user_name, user_email, course_slug, rating, comment, created_at
     FROM course_reviews
     WHERE course_slug = $1
     ORDER BY created_at DESC`,
    [courseSlug]
  );

  return NextResponse.json({ reviews: rows });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseSlug, rating, comment } = await req.json();
  const clamped = Math.round(Number(rating));
  if (!courseSlug || !Number.isFinite(clamped) || clamped < 1 || clamped > 5) {
    return NextResponse.json({ error: "A course and a 1–5 star rating are required" }, { status: 400 });
  }

  const userName = session.user.name ?? session.user.email.split("@")[0];

  // One review per user per course — posting again updates the existing review.
  const { rows } = await db.query<ReviewRow>(
    `INSERT INTO course_reviews (user_id, user_name, user_email, course_slug, rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, course_slug) DO UPDATE
       SET rating = EXCLUDED.rating,
           comment = EXCLUDED.comment,
           user_name = EXCLUDED.user_name,
           created_at = NOW()
     RETURNING id, user_id, user_name, user_email, course_slug, rating, comment, created_at`,
    [session.user.id, userName, session.user.email, courseSlug, clamped, (comment ?? "").trim()]
  );

  return NextResponse.json({ review: rows[0] }, { status: 201 });
}
