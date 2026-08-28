import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";
import { deleteOwnedCourse, ensureCourseCatalog, updateOwnedCourse, validateCourse } from "@/lib/course-catalog";

const manager = (role: unknown) => role === "admin" || role === "tutor";
const fail = (operation: string, id: string, error: unknown) => { console.error(JSON.stringify({ operation, requestId: id, error: error instanceof Error ? error.message : "unknown" })); return NextResponse.json({ error: "Unable to process course." }, { status: 500 }); };
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const requestId = crypto.randomUUID(), session = await getServerSession(authOptions), { slug } = await params;
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!manager(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const course = validateCourse(await readJsonBody(req, 256_000), slug, true);
    if (!course.ok) return NextResponse.json({ error: course.error }, { status: 422 });
    await ensureCourseCatalog();
    const result = await updateOwnedCourse(course.course, Number(session.user.id), session.user.role === "admin");
    if (result === "not-found-or-forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result === "stale") return NextResponse.json({ error: "Course was updated by another editor. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ course: course.course });
  } catch (error) { if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Request body too large." }, { status: 413 }); if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); return fail("courses.update", requestId, error); }
}
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const requestId = crypto.randomUUID(), session = await getServerSession(authOptions), { slug } = await params;
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!manager(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { await ensureCourseCatalog();
    const deleted = await deleteOwnedCourse(slug, Number(session.user.id), session.user.role === "admin");
    if (!deleted) return NextResponse.json({ error: "Course not found." }, { status: 404 }); return new NextResponse(null, { status: 204 });
  } catch (error) { return fail("courses.delete", requestId, error); }
}