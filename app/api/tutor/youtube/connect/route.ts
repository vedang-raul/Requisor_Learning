export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildAuthUrl, videoDelivery } from "@/lib/youtube";

/** Starts the Google consent screen so a tutor can connect their YouTube channel. */
const canManage = (role: unknown) => role === "admin" || role === "tutor";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = Number(session.user.id);
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (videoDelivery() !== "youtube") {
    return NextResponse.json({ error: "Posting to YouTube isn't switched on for this server." }, { status: 409 });
  }
  return NextResponse.redirect(buildAuthUrl(userId));
}
