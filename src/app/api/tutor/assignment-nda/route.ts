export const runtime = "nodejs";

import { requireAccess } from "@/lib/server/access";
import { findLessonLocation } from "@/lib/courses/course-catalog";
import { ndaSignatures } from "@/lib/courses/assignment-nda";

/**
 * Who signed a branded assignment's NDA, for the tutor who owns the course (and
 * the university's admins, and super admins).
 *   GET ?lessonId=… → { signatures: [{ name, email, signedName, signedAt, current }] }
 */
export async function GET(req: Request) {
  const who = await requireAccess("tutor");
  if (who instanceof Response) return who;
  const location = await findLessonLocation(new URL(req.url).searchParams.get("lessonId")?.trim());
  const allowed = location && (who.superAdmin || location.ownerUserId === who.userId || (who.role === "admin" && who.universityId !== null && who.universityId === location.universityId));
  if (!location || !allowed) return Response.json({ error: "Lesson not found." }, { status: 404 });
  return Response.json({ signatures: await ndaSignatures(location.lessonId) });
}
