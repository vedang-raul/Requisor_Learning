export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/** Streams one learner's submitted file to the tutor who owns its course (or an admin). */
const canManage = (role: unknown) => role === "admin" || role === "tutor";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const isAdmin = session.user.role === "admin";

  const url = new URL(req.url);
  const submissionId = Number(url.searchParams.get("submissionId"));
  if (!Number.isSafeInteger(submissionId) || submissionId < 1) {
    return Response.json({ error: "A valid submissionId is required." }, { status: 400 });
  }
  // The grading view's PDF viewer loads this in an <iframe> and its docx
  // parser fetches it in the background — neither should force a download.
  const inline = url.searchParams.get("inline") === "1";

  const { rows } = await db.query<{ file_name: string; mime_type: string; content: Buffer }>(
    `SELECT s.file_name, s.mime_type, s.content
     FROM assignment_submissions s
     JOIN courses c ON c.slug = s.course_slug
     WHERE s.id = $1 AND ($2::boolean OR c.owner_user_id = $3)`,
    [submissionId, isAdmin, userId]
  );
  const submission = rows[0];
  if (!submission) return Response.json({ error: "Submission not found." }, { status: 404 });

  return new Response(new Uint8Array(submission.content), {
    headers: {
      "Content-Type": submission.mime_type || "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(submission.file_name)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
