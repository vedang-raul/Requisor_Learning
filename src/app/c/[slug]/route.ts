/**
 * A course's quick share link: /c/<course>. It only points at the course page;
 * it is not a token and grants nothing. Signed-out visitors are sent to sign in
 * and brought back to the course (see src/lib/navigation/after-sign-in.ts), and
 * the course page shows the course only to people who may see it.
 * Every address gets the same redirect, so the link says nothing about whether
 * a course exists.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = new URL(SLUG.test(slug) && slug.length <= 80 ? `/app/course/?slug=${slug}` : "/app/dashboard/", req.url);
  return Response.redirect(target, 307);
}
