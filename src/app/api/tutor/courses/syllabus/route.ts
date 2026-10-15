export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { manageReach, type Reach } from "@/lib/server/course-scope";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { ensureCourseCatalog } from "@/lib/courses/course-catalog";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { cleanSyllabus } from "@/lib/courses/syllabus";

/**
 * Saves (or removes) a course's syllabus. Kept apart from the course editor's
 * save so that filling in a long syllabus never collides with lesson edits.
 * Body: { slug, syllabus } where syllabus is a filled template, an uploaded
 * file reference, or null to remove it.
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const MAX_BODY_BYTES = 200 * 1024;

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  // Super admins reach every course; a university admin, their university's.
  const adminReach = manageReach(session.user);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "That syllabus is too long to save." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const { slug, syllabus: raw } = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,80}$/i.test(slug)) return NextResponse.json({ error: "Course not found." }, { status: 404 });

  const syllabus = raw === null ? null : cleanSyllabus(raw);
  if (raw !== null && !syllabus) return NextResponse.json({ error: "That isn't a valid syllabus. Upload a PDF or Word (.docx) file, or fill in the template." }, { status: 400 });

  await ensureCourseCatalog();
  // A tutor may only attach a file they uploaded themselves.
  if (syllabus?.kind === "file" && !adminReach.all && adminReach.universityId === null) {
    const owned = await db.query("SELECT 1 FROM resource_files WHERE id = $1 AND owner_user_id = $2", [syllabus.fileUrl.slice("/api/resources/".length), userId]);
    if (!owned.rowCount) return NextResponse.json({ error: "Upload the syllabus file again." }, { status: 400 });
  }

  const { rowCount } = await db.query(
    "UPDATE courses SET syllabus = $1::jsonb, updated_at = NOW() WHERE slug = $2 AND ($3::boolean OR (university_id IS NOT NULL AND university_id = $5::int) OR owner_user_id = $4)",
    [syllabus ? JSON.stringify(syllabus) : null, slug, adminReach.all, userId, adminReach.universityId]
  );
  if (!rowCount) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  return NextResponse.json({ syllabus });
}
