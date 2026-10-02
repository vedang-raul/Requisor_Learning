export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { refreshVideoEditJob, toVideoEditJob, type VideoEditJobRow } from "@/lib/video-edit-jobs";

/** Polls one of the tutor's own auto-edit jobs. */
const canManage = (role: unknown) => role === "admin" || role === "tutor";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const { rows } = await db.query<VideoEditJobRow>("SELECT * FROM video_edit_jobs WHERE id = $1 AND owner_user_id = $2", [id, userId]);
  if (!rows[0]) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  return NextResponse.json({ job: toVideoEditJob(await refreshVideoEditJob(rows[0])) });
}
