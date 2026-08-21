import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { issueGrant, GRANT_COOKIE_NAME } from "@/lib/captcha-grant";

/**
 * POST /api/auth/google-initiate
 *
 * CAPTCHA gate for Google OAuth initiation.  The client POSTs the Turnstile
 * token here; if it passes, the server issues a short-lived, HMAC-signed
 * HttpOnly cookie (`captcha-grant`).  The browser then sends that cookie
 * automatically when signIn("google") POSTs to /api/auth/signin/google,
 * where it is verified and required before NextAuth proceeds.
 *
 * This two-step design creates real server-side state that cannot be bypassed
 * by posting directly to /api/auth/signin/google — the grant cookie must be
 * present and cryptographically valid.
 */
export async function POST(req: Request) {
  let token: string | null = null;
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && "token" in body) {
      const t = (body as Record<string, unknown>).token;
      token = typeof t === "string" ? t : null;
    }
  } catch {
    // Malformed body — token stays null, Turnstile verification will fail below.
  }

  const { success } = await verifyTurnstile(token);
  if (!success) {
    return NextResponse.json(
      { error: "Bot check failed — please try again." },
      { status: 403 }
    );
  }

  // Issue a signed grant cookie so the subsequent /api/auth/signin/google POST
  // can prove it was preceded by a valid CAPTCHA challenge.
  const grant = issueGrant();
  const isSecure = process.env.NODE_ENV === "production";

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: GRANT_COOKIE_NAME,
    value: grant.value,
    httpOnly: true,
    sameSite: "strict",
    maxAge: grant.maxAgeSeconds,
    path: "/api/auth",
    secure: isSecure,
  });
  return res;
}
