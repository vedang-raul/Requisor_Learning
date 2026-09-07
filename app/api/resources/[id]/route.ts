import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { isValidResourceFileId, resourceFileUrl } from "@/lib/resource-files";

type ResourceFileRow = { filename: string; mime_type: string; data: Buffer };

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderTextPreviewHtml(text: string, title: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>:root{color-scheme:light}body{margin:0;padding:24px;background:#F3F4F6}pre{margin:0 auto;max-width:860px;padding:24px;background:#fff;border:1px solid #E5E7EB;border-radius:14px;color:#27272A;font-family:ui-monospace,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}</style>
</head><body><pre>${escapeHtml(text)}</pre></body></html>`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!isValidResourceFileId(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const userId = Number(session.user.id);
  const isAdmin = session.user.role === "admin";
  const url = resourceFileUrl(id);
  // A file ID is not an authorization token. Learners may read a file only
  // once it is referenced by a published course; tutors may read files in
  // courses they own (and their own unlinked uploads); admins may read all.
  const { rows } = await db.query<ResourceFileRow>(
    `SELECT rf.filename, rf.mime_type, rf.data
     FROM resource_files rf
     WHERE rf.id=$1 AND (
       $2::boolean OR rf.owner_user_id=$3 OR EXISTS (
         SELECT 1 FROM course_lessons l
         JOIN courses c ON c.slug=l.course_slug
         WHERE (l.body_file_url=$4
            OR l.resources @> jsonb_build_array(jsonb_build_object('url', $4)))
           AND (c.published OR c.owner_user_id=$3)
       )
     )`,
    [id, isAdmin, userId, url]
  );
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const safeName = row.filename.replace(/[\r\n"]/g, "");
  if (row.mime_type === "text/plain") {
    return new NextResponse(renderTextPreviewHtml(row.data.toString("utf-8"), safeName), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, max-age=3600" },
    });
  }
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}