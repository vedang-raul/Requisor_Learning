import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureCourseCatalog } from "@/lib/course-catalog";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Public, unauthenticated aggregate ratings for the landing page's "Meet
 * your tutors" section. Aggregate-only (average + count), same shape as the
 * tutor-facing /api/tutor/courses summary — no review text, no reviewer
 * identities. This is marketing-facing social proof, so it must be real
 * data, not placeholder numbers: if a course has no reviews yet, the
 * caller gets a genuine zero rather than a fabricated rating.
 */

const KNOWN_SLUGS = ["product-management", "data-analytics", "agentic-ai", "cyber-security"];

// Generous but non-zero — this is a cheap aggregate read, the limit exists
// only to blunt scraping loops, not to protect an expensive resource.
const ratingsLimiter = createRateLimiter(60, 60_000);

function clientIp(req: Request): string {
  const xRealIp = req.headers.get("x-real-ip")?.trim();
  if (xRealIp) return xRealIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const rightmost = forwarded.split(",").at(-1)?.trim();
    if (rightmost) return rightmost;
  }
  return "127.0.0.1";
}

type RatingRow = { slug: string; average_rating: string | null; review_count: string };

export async function GET(req: Request) {
  const { limited, retryAfterMs } = ratingsLimiter.check(clientIp(req));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  try {
    await ensureCourseCatalog();
    const { rows } = await db.query<RatingRow>(
      `SELECT c.slug, AVG(r.rating)::float AS average_rating, COUNT(r.id)::int AS review_count
       FROM courses c
       LEFT JOIN course_reviews r ON r.course_slug = c.slug
       WHERE c.slug = ANY($1::text[])
       GROUP BY c.slug`,
      [KNOWN_SLUGS]
    );
    const ratings: Record<string, { average: number; count: number }> = {};
    for (const slug of KNOWN_SLUGS) {
      const row = rows.find((r) => r.slug === slug);
      const count = Number(row?.review_count ?? 0);
      ratings[slug] = { average: count > 0 ? Number(row!.average_rating) : 0, count };
    }
    return NextResponse.json({ ratings });
  } catch (error) {
    console.error(JSON.stringify({ operation: "public.tutor-ratings.get", error: error instanceof Error ? error.message : "unknown" }));
    return NextResponse.json({ error: "Unable to load ratings." }, { status: 500 });
  }
}
