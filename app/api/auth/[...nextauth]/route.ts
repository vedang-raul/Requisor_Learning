import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { verifyGrant, GRANT_COOKIE_NAME } from "@/lib/captcha-grant";

const handler = NextAuth(authOptions);

// ── Login brute-force protection ──────────────────────────────────────────────
// 10 credential sign-in attempts per IP per 15 minutes.  Only the credentials
// callback is throttled — signOut, CSRF token, and other NextAuth POST paths
// pass through unchanged so normal session behaviour is unaffected.
//
// The check runs before NextAuth processes the request so we can return a real
// HTTP 429 rather than a redirect.  In-process store; see LOAD_TEST.md for
// the Redis upgrade path when running multiple replicas.
const loginLimiter = createRateLimiter(10, 15 * 60_000);

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

export { handler as GET };

export async function POST(
  req: Request,
  ctx: { params: Promise<{ nextauth: string[] }> }
): Promise<Response> {
  // Only the credentials sign-in path is rate-limited and CAPTCHA-checked.
  // signOut, CSRF token, and other NextAuth POST paths pass through unchanged.
  const url = new URL(req.url);
  // ── Google OAuth initiation — captcha-grant cookie check ─────────────────
  // signIn("google") POSTs here after /api/auth/google-initiate has issued a
  // signed grant cookie.  Attackers who skip google-initiate and POST directly
  // are rejected because they have no valid cookie.
  if (url.pathname.includes("/signin/google")) {
    const cookieHeader = req.headers.get("cookie") ?? "";
    // Parse the captcha-grant cookie value from the Cookie header.
    const grantMatch = new RegExp(
      `(?:^|;\\s*)${GRANT_COOKIE_NAME}=([^;]+)`
    ).exec(cookieHeader);
    const grant = grantMatch?.[1] ?? null;
    if (!verifyGrant(grant)) {
      return Response.json(
        { error: "Bot check failed — please try again." },
        { status: 403 }
      );
    }
  }

  if (url.pathname.includes("/callback/credentials")) {
    // ── Rate limit ────────────────────────────────────────────────────────
    const ip = clientIp(req);
    const { limited, retryAfterMs } = loginLimiter.check(ip);
    if (limited) return rateLimitResponse(retryAfterMs);

    // ── Turnstile CAPTCHA ─────────────────────────────────────────────────
    // Clone the request so the body stream is preserved for NextAuth.
    // NextAuth sends credentials as URL-encoded form data; extra fields
    // passed to signIn() (like turnstileToken) are included in that body.
    const bodyText = await req.clone().text();
    const params = new URLSearchParams(bodyText);
    const captchaToken = params.get("turnstileToken") ?? null;
    const { success: captchaOk } = await verifyTurnstile(captchaToken);
    if (!captchaOk) {
      return Response.json(
        { error: "Bot check failed — please try again." },
        { status: 403 }
      );
    }
  }

  return handler(req, ctx) as Promise<Response>;
}
