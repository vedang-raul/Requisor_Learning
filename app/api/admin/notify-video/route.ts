import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendNewVideoEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";

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

  const { rows } = await db.query<{ id: number; email: string; name: string | null }>(
    "SELECT id, email, name FROM users WHERE email_verified = TRUE"
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
