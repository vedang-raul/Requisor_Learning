export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBaseUrl } from "@/lib/base-url";
import { exchangeCode, fetchOwnChannel, saveConnection, verifyOAuthState, videoDelivery } from "@/lib/youtube";

/**
 * Google redirects here after the tutor approves (or declines) access. The
 * signed `state` must match the signed-in tutor who started the flow, so a
 * link crafted for someone else can't attach a channel to this account.
 */
const back = (result: string) => NextResponse.redirect(`${getBaseUrl()}/app/tutor/?youtube=${result}`);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isSafeInteger(userId)) return back("signin");
  if (videoDelivery() !== "youtube") return back("off");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (url.searchParams.get("error") || !code) return back("declined");
  if (verifyOAuthState(state) !== userId) return back("invalid");

  try {
    const tokens = await exchangeCode(code);
    // Google only returns a refresh token on first consent; without one we
    // couldn't post later, so treat it as a failed connection.
    if (!tokens.refresh_token) return back("no-token");
    const channel = await fetchOwnChannel(tokens.access_token);
    await saveConnection(userId, tokens.refresh_token, channel);
    return back("connected");
  } catch (error) {
    console.error(JSON.stringify({ operation: "youtube.callback", error: error instanceof Error ? error.message : "unknown" }));
    return back("failed");
  }
}
