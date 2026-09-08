export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
/** Streams back one of the signed-in learner's own submitted files. */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const submissionId = Number(params.get("submissionId"));
  const lessonId = params.get("lessonId")?.trim();
  if ((!Number.isSafeInteger(submissionId) || submissionId < 1) && !lessonId) {
    return Response.json({ error: "A valid submissionId or lessonId is required." }, { status: 400 });
  }

  const { rows: userRows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });

  const bySubmissionId = Number.isSafeInteger(submissionId) && submissionId > 0;
  const { rows } = await db.query<{ file_name: string; mime_type: string; content: Buffer }>(
    `SELECT file_name, mime_type, content
     FROM assignment_submissions
     WHERE user_id = $1 AND ${bySubmissionId ? "id = $2" : "lesson_id = $2"}`,
    [user.id, bySubmissionId ? submissionId : lessonId]
  );
  const submission = rows[0];
  if (!submission) return Response.json({ error: "No submission yet." }, { status: 404 });

  return new Response(new Uint8Array(submission.content), {
    headers: {
      "Content-Type": submission.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(submission.file_name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
