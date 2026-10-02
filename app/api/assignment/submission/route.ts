export const runtime = "nodejs";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { findLessonLocation } from "@/lib/course-catalog";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/notifications";
import { sendAssignmentSubmittedEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";
import type { SubmissionSource } from "@/lib/submission-source";

// A learner's upload for a tutor-required assignment or a personalized
// practice assignment already generated for that learner. GET returns the
// learner's own submission metadata (never the
// file bytes — see /api/assignment/submission/file for that). POST uploads
// or resubmits; a resubmit overwrites the previous file and bumps
// submitted_at, matching the "one current submission per lesson" schema.

const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024; // 10 MB
// PDF and Word (.docx) only: the tutor grading view renders these in-browser
// for markup (native PDF rendering, and a from-scratch docx-to-HTML parser —
// see lib/docx-parser.ts) without sending files to a third-party viewer.
// Older .doc, PowerPoint, Excel etc. have no in-browser rendering path here.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Uploads per learner: 20 per 10 minutes — generous for genuine resubmission,
// not for hammering the DB with large blobs.
const uploadLimiter = createRateLimiter(20, 10 * 60_000);

async function canSubmitAssignment(userId: number, lessonId: string, requiresSubmission: boolean): Promise<boolean> {
  if (requiresSubmission) return true;
  const { rows } = await db.query(
    "SELECT 1 FROM generated_assignments WHERE user_id = $1 AND lesson_id = $2",
    [userId, lessonId]
  );
  return Boolean(rows[0]);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const lessonId = new URL(req.url).searchParams.get("lessonId")?.trim();
  const location = await findLessonLocation(lessonId);
  // Learners can only submit to lessons they can see (not drafts).
  if (!location || !location.visibleToLearners) return Response.json({ error: "Lesson not found." }, { status: 404 });

  const { rows: userRows } = await db.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });
  if (!await canSubmitAssignment(user.id, location.lessonId, location.requiresSubmission)) {
    return Response.json({ error: "Generate or receive an assignment before submitting work." }, { status: 409 });
  }

  const { rows } = await db.query<{ file_name: string; file_size: number; submitted_at: string }>(
    "SELECT file_name, file_size, submitted_at FROM assignment_submissions WHERE user_id = $1 AND lesson_id = $2",
    [user.id, location.lessonId]
  );
  const submission = rows[0];
  if (!submission) return Response.json({ error: "No submission yet." }, { status: 404 });

  return Response.json({
    fileName: submission.file_name,
    fileSize: submission.file_size,
    submittedAt: submission.submitted_at,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { limited, retryAfterMs } = uploadLimiter.check(session.user.email.toLowerCase());
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_SUBMISSION_BYTES + 65_536) {
    return Response.json({ error: "File is too large. Maximum size is 10 MB." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const lessonId = form.get("lessonId");
  const file = form.get("file");
  if (typeof lessonId !== "string" || !(file instanceof File)) {
    return Response.json({ error: "A lessonId and file are required." }, { status: 400 });
  }
  if (file.size === 0) return Response.json({ error: "The selected file is empty." }, { status: 400 });
  if (file.size > MAX_SUBMISSION_BYTES) {
    return Response.json({ error: "File is too large. Maximum size is 10 MB." }, { status: 413 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return Response.json(
      { error: "Unsupported file type. Upload a PDF or Word (.docx) document." },
      { status: 415 }
    );
  }
  const fileName = file.name.slice(0, 200).trim() || "submission";
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" &&
    fileName.toLowerCase().endsWith(".pdf") &&
    bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isDocx = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    fileName.toLowerCase().endsWith(".docx") &&
    bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06));
  if (!isPdf && !isDocx) {
    return Response.json({ error: "The file contents do not match a valid PDF or Word (.docx) document." }, { status: 415 });
  }

  const location = await findLessonLocation(lessonId);
  // Learners can only submit to lessons they can see (not drafts).
  if (!location || !location.visibleToLearners) return Response.json({ error: "Lesson not found." }, { status: 404 });

  const { rows: userRows } = await db.query<{ id: number; name: string | null }>(
    "SELECT id, name FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  const user = userRows[0];
  if (!user) return Response.json({ error: "Profile not found." }, { status: 404 });
  if (!await canSubmitAssignment(user.id, location.lessonId, location.requiresSubmission)) {
    return Response.json({ error: "Generate or receive an assignment before submitting work." }, { status: 409 });
  }

  // A lesson that requires a submission is the tutor's own assignment;
  // otherwise the learner is answering their AI-generated practice brief
  // (canSubmitAssignment above guarantees one exists).
  const source: SubmissionSource = location.requiresSubmission ? "tutor" : "ai";

  const { rows } = await db.query<{ id: number; submitted_at: string }>(
    `WITH saved AS (
       INSERT INTO assignment_submissions (user_id, lesson_id, course_slug, file_name, mime_type, file_size, content, source, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         course_slug = EXCLUDED.course_slug, file_name = EXCLUDED.file_name,
         mime_type = EXCLUDED.mime_type, file_size = EXCLUDED.file_size,
         content = EXCLUDED.content, source = EXCLUDED.source, submitted_at = NOW()
       RETURNING id, submitted_at
     ),
     cleared_scores AS (
       DELETE FROM assignment_grade_scores WHERE submission_id IN (SELECT id FROM saved)
     ),
     cleared_annotations AS (
       DELETE FROM assignment_annotations WHERE submission_id IN (SELECT id FROM saved)
     ),
     cleared_grade AS (
       DELETE FROM assignment_grades WHERE submission_id IN (SELECT id FROM saved)
     )
     SELECT id, submitted_at FROM saved`,
    [user.id, location.lessonId, location.courseSlug, fileName, file.type, bytes.byteLength, bytes, source]
  );
  const submission = rows[0];

  // Best-effort: the tutor who owns this course gets an in-app notification
  // and an email. Neither should ever fail the learner's upload — a Gmail
  // hiccup or a missing tutor account is logged, not surfaced to them.
  if (location.ownerUserId) {
    try {
      const studentName = user.name || session.user.email;
      const link = `${getBaseUrl()}/app/tutor/assignment/?submissionId=${submission.id}`;
      const { rows: tutorRows } = await db.query<{ email: string; name: string | null }>(
        "SELECT email, name FROM users WHERE id = $1",
        [location.ownerUserId]
      );
      const tutor = tutorRows[0];
      await notifyUser(location.ownerUserId, {
        kind: "assignment",
        title: source === "ai" ? "New AI practice submission" : "New assignment submission",
        body: source === "ai"
          ? `${studentName} submitted their AI practice assignment for "${location.lessonTitle}" in ${location.courseTitle}.`
          : `${studentName} submitted "${location.lessonTitle}" in ${location.courseTitle}.`,
        link: `/app/tutor/assignment/?submissionId=${submission.id}`,
      });
      if (tutor) await sendAssignmentSubmittedEmail(tutor.email, tutor.name ?? "", {
        studentName, lessonTitle: location.lessonTitle, courseTitle: location.courseTitle, link,
      });
    } catch (error) {
      console.error(JSON.stringify({
        operation: "assignment.submission.notify-tutor",
        submissionId: submission.id,
        error: error instanceof Error ? error.message : "unknown",
      }));
    }
  }

  return Response.json({ fileName, fileSize: bytes.byteLength, submittedAt: submission.submitted_at });
}
