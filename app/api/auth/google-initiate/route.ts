import { NextResponse } from "next/server";
import { verifyTurnstile } from "@/lib/turnstile";
import { issueGrant, GRANT_COOKIE_NAME } from "@/lib/captcha-grant";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

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

// ── Per-IP rate limiting ──────────────────────────────────────────────────────
// 10 initiation attempts per IP per 15 minutes.  Caps CAPTCHA-farm flooding
// even when solvers supply valid Turnstile tokens.
const googleInitiateLimiter = createRateLimiter(10, 15 * 60_000);

/**
 * Extract the trusted client IP from proxy headers.
 *
 * Trust model (Replit deployment):
 *  1. `x-real-ip`       — written exclusively by Replit's ingress proxy;
 *                         any client-supplied value is stripped before it
 *                         reaches application code.  Preferred source.
 *  2. rightmost `x-forwarded-for` — each proxy in the chain appends one IP.
 *                         The rightmost entry is added by the immediate upstream
 *                         (Replit's ingress) and is not injectable by the client.
 *                         Never trust the leftmost value: an attacker can prepend
 *                         arbitrary IPs and bypass per-IP rate limits.
 */
function clientIp(req: Request): string {
  const xRealIp = req.headers.get("x-real-ip")?.trim();
  if (xRealIp) return xRealIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const rightmost = forwarded.split(",").at(-1)?.trim();
    if (rightmost) return rightmost;
  }

  return "127.0.0.1"; // dev / test fallback
}

export async function POST(req: Request) {
  // Rate-limit by IP before any body parsing or CAPTCHA verification.
  const { limited, retryAfterMs } = googleInitiateLimiter.check(clientIp(req));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

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
