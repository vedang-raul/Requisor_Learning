export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchOutput } from "@/lib/auphonic";
import { editedVideoSource, type VideoEditJobRow } from "@/lib/video-edit-jobs";

/**
 * Streams a finished job's edited video from Auphonic to its owner. Auphonic's
 * file links need the API key, so the browser can't use them directly. Byte
 * ranges are passed through so the video can also be previewed (?inline=1).
 */
const canManage = (role: unknown) => role === "admin" || role === "tutor";
const PASS_THROUGH = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  const { rows } = await db.query<VideoEditJobRow>("SELECT * FROM video_edit_jobs WHERE id = $1 AND owner_user_id = $2", [id, userId]);
  const source = rows[0] ? editedVideoSource(rows[0]) : null;
  if (!source) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetchOutput(source.url, { range: req.headers.get("range") });
  } catch {
    return NextResponse.json({ error: "Couldn't fetch the edited video. Please try again." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    // Auphonic only keeps result files for a limited time.
    return NextResponse.json(
      { error: "The edited video is no longer available. Edit the recording again to get a fresh copy." },
      { status: upstream.status === 404 ? 410 : 502 }
    );
  }

  const headers = new Headers();
  for (const name of PASS_THROUGH) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!/^video\//i.test(headers.get("content-type") ?? "")) headers.set("content-type", "video/mp4");
  const extension = (rows[0].file_name.match(/\.(mp4|mov|webm|m4v)$/i)?.[1] ?? "mp4").toLowerCase();
  const name = `${rows[0].title.replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lesson"}-edited.${extension}`;
  headers.set("content-disposition", `${req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${name}"`);
  headers.set("cache-control", "private, no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
