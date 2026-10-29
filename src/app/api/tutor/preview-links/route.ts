import { NextResponse } from "next/server";
import { requireAccess, type RequestAccess } from "@/lib/server/access";
import { manageReach, manageSql, reachParams } from "@/lib/server/course-scope";
import { ensureCourseCatalog, getCourses } from "@/lib/courses/course-catalog";
import { createPreviewLink, listMyPreviewLinks, listPreviewLinks, revokeMyPreviewLink, revokePreviewLink } from "@/lib/courses/preview-links";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";

/**
 * Proposal preview links for a course the tutor owns (or, for admins, manages):
 *   GET    ?course=<slug>         the course's links
 *   GET    (no course)            every link this person made, across their courses
 *   POST   { course, modules, label }  a new link; its address is returned only now
 *   DELETE ?course=<slug>&id=<n>  revoke a link of a course they manage
 *   DELETE ?id=<n>                revoke one of their own links
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const creating = createRateLimiter(30, 60 * 60_000);

async function managedCourse(slug: unknown, who: RequestAccess) {
  if (typeof slug !== "string" || slug.length > 80 || !SLUG.test(slug)) return null;
  await ensureCourseCatalog();
  const [course] = await getCourses(`WHERE c.slug=$1 AND (c.owner_user_id=$2 OR ${manageSql("c", 3, 4)})`,
    [slug, who.userId, ...reachParams(manageReach(who))]);
  return course ?? null;
}
const notFound = () => NextResponse.json({ error: "Course not found." }, { status: 404 });
const noStore = { headers: { "Cache-Control": "private, no-store" } };

export async function GET(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  const slug = new URL(req.url).searchParams.get("course");
  if (slug === null) return NextResponse.json({ links: await listMyPreviewLinks(who.userId) }, noStore);
  const course = await managedCourse(slug, who);
  if (!course) return notFound();
  return NextResponse.json({ links: await listPreviewLinks(course) }, noStore);
}

export async function POST(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  if (creating.check(String(who.userId)).limited) return NextResponse.json({ error: "Too many links made in the last hour. Try again later." }, { status: 429 });
  let body: unknown;
  try {
    body = await readJsonBody(req, 16 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const input = (body ?? {}) as { course?: unknown; modules?: unknown; label?: unknown };
  const course = await managedCourse(input.course, who);
  if (!course) return notFound();
  const result = await createPreviewLink(course, input.modules, input.label, who.userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ token: result.token, link: result.link }, { status: 201, ...noStore });
}

export async function DELETE(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  const params = new URL(req.url).searchParams;
  const id = Number(params.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  if (!params.has("course")) {
    if (!(await revokeMyPreviewLink(id, who.userId))) return NextResponse.json({ error: "Link not found." }, { status: 404 });
    return NextResponse.json({ ok: true }, noStore);
  }
  const course = await managedCourse(params.get("course"), who);
  if (!course) return notFound();
  if (!(await revokePreviewLink(course.slug, id))) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  return NextResponse.json({ ok: true }, noStore);
}
