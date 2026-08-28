import { NextResponse } from "next/server";
import { isTurnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { issueGrant, GRANT_COOKIE_NAME } from "@/lib/captcha-grant";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";
import crypto from "crypto";

const ROLE_INTENT_COOKIE_NAME = "google-role-intent";
const ROLE_INTENT_MAX_AGE = 2 * 60;
const GOOGLE_INITIATE_BODY_MAX_BYTES = 8 * 1024;
const MAX_TURNSTILE_TOKEN_LENGTH = 4096;
const MAX_ACCOUNT_TYPE_LENGTH = 16;

function roleIntent(): string {
  const timestamp = Date.now().toString();
  const secret = process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-role-intent-secret-not-for-production" : "");
  if (!secret) throw new Error("Role intent signing secret is not configured.");
  const signature = crypto.createHmac("sha256", secret).update(`tutor-role-intent:${timestamp}`).digest("hex");
  return `${timestamp}.${signature}`;
}

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

  let body: unknown;
  try {
    body = await readJsonBody(req, GOOGLE_INITIATE_BODY_MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "token" && key !== "accountType")
  ) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { token, accountType: rawAccountType } = body as Record<string, unknown>;
  if (
    (typeof token !== "string" && token !== undefined) ||
    (typeof rawAccountType !== "string" && rawAccountType !== undefined) ||
    (typeof token === "string" && token.length > MAX_TURNSTILE_TOKEN_LENGTH) ||
    (typeof rawAccountType === "string" && rawAccountType.length > MAX_ACCOUNT_TYPE_LENGTH)
  ) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const captchaToken = typeof token === "string" ? token : null;
  const accountType = typeof rawAccountType === "string" ? rawAccountType.toLowerCase() : undefined;

  if (accountType !== undefined && accountType !== "tutor") {
    return NextResponse.json({ error: "Select a valid account type." }, { status: 400 });
  }

  let grant: ReturnType<typeof issueGrant> | null = null;
  if (isTurnstileEnabled()) {
    const { success } = await verifyTurnstile(captchaToken);
    if (!success) {
      return NextResponse.json(
        { error: "Bot check failed — please try again." },
        { status: 403 }
      );
    }
    // Issue a signed grant cookie so the subsequent /api/auth/signin/google POST
    // can prove it was preceded by a valid CAPTCHA challenge.
    grant = issueGrant();
  }

  const isSecure = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true });
  if (grant) {
    res.cookies.set({
      name: GRANT_COOKIE_NAME,
      value: grant.value,
      httpOnly: true,
      sameSite: "strict",
      maxAge: grant.maxAgeSeconds,
      path: "/api/auth",
      secure: isSecure,
    });
  }
  if (accountType === "tutor") {
    res.cookies.set({
      name: ROLE_INTENT_COOKIE_NAME,
      value: roleIntent(),
      httpOnly: true,
      sameSite: "lax",
      maxAge: ROLE_INTENT_MAX_AGE,
      path: "/",
      secure: isSecure,
    });
  } else {
    // A learner flow deliberately has no role intent. Clear a previous tutor
    // initiation in the same browser so its short-lived cookie cannot affect
    // this new OAuth attempt.
    res.cookies.set({
      name: ROLE_INTENT_COOKIE_NAME,
      value: "",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 0,
      path: "/",
      secure: isSecure,
    });
  }
  return res;
}
