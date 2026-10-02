export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteConnection, getConnection, videoDelivery, youtubeConfigured } from "@/lib/youtube";

/** The tutor's YouTube connection: GET its status, DELETE to disconnect. */
const canManage = (role: unknown) => role === "admin" || role === "tutor";

async function currentUserId(): Promise<number | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return userId;
}

export async function GET() {
  const userId = await currentUserId();
  if (userId instanceof NextResponse) return userId;
  const connection = youtubeConfigured() ? await getConnection(userId).catch(() => null) : null;
  return NextResponse.json({
    configured: youtubeConfigured(),
    delivery: videoDelivery(),
    connected: Boolean(connection),
    channelTitle: connection?.channelTitle ?? null,
  });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (userId instanceof NextResponse) return userId;
  await deleteConnection(userId);
  return NextResponse.json({ connected: false });
}
