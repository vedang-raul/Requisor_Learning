import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { sendNewVideoEmail } from "@/lib/server/email";
import { getBaseUrl } from "@/lib/server/base-url";
import { canSeeCourse } from "@/lib/server/course-scope";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { courseSlug, courseTitle, lessonId, lessonTitle, message } = await req.json().catch(() => ({}));
  if (!courseSlug || !courseTitle || !lessonTitle) {
    return NextResponse.json({ error: "courseSlug, courseTitle and lessonTitle are required." }, { status: 400 });
  }

  const link = lessonId
    ? `${getBaseUrl()}/app/learn/?course=${encodeURIComponent(courseSlug)}&lesson=${encodeURIComponent(lessonId)}`
    : `${getBaseUrl()}/app/course/?slug=${encodeURIComponent(courseSlug)}`;

  // Only the people who can open the course are emailed: its university's members, or for a
  // platform course everyone (a super admin) or the admin's own university (a university admin).
  const { rows: courseRows } = await db.query<{ university_id: number | null }>("SELECT university_id FROM courses WHERE slug = $1", [String(courseSlug)]);
  if (!courseRows[0]) return NextResponse.json({ error: "Course not found." }, { status: 404 });
  const courseUniversity = courseRows[0].university_id;
  if (!canSeeCourse(session.user, courseUniversity)) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const audience = courseUniversity ?? (session.user.superAdmin ? null : session.user.universityId ?? -1);
  const { rows } = await db.query<{ id: number; email: string; name: string | null }>(
    "SELECT id, email, name FROM users WHERE email_verified = TRUE AND ($1::int IS NULL OR university_id = $1::int)",
    [audience]
  );

  let sent = 0;
  const failures: string[] = [];
  for (const u of rows) {
    try {
      await sendNewVideoEmail(u.email, u.name ?? "", {
        courseTitle: String(courseTitle),
        lessonTitle: String(lessonTitle),
        message: typeof message === "string" && message.trim() ? message.trim() : undefined,
        link,
      });
      sent++;
    } catch (e) {
      console.error(`Notify email failed for user id=${u.id}:`, e);
      failures.push(u.email);
    }
  }
  return NextResponse.json({ ok: true, sent, failed: failures });
}
