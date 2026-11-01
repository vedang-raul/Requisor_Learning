/**
 * A course's quick share link: /c/<course>. It only points at the course page;
 * it is not a token and grants nothing. Signed-out visitors are sent to sign in
 * and brought back to the course (see src/lib/navigation/after-sign-in.ts), and
 * the course page shows the course only to people who may see it.
 * Every address gets the same redirect, so the link says nothing about whether
 * a course exists.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // A relative address: behind a proxy req.url is the internal host (localhost:5000 on Replit),
  // so the browser must resolve this against the address the visitor actually used.
  const target = SLUG.test(slug) && slug.length <= 80 ? `/app/course/?slug=${slug}` : "/app/dashboard/";
  return new Response(null, { status: 307, headers: { Location: target } });
}
