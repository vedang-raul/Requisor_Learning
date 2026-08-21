/**
 * lib/captcha-grant.ts
 *
 * Short-lived, HMAC-signed CAPTCHA grants for the Google OAuth initiation path.
 *
 * Flow:
 *  1. Client verifies Turnstile CAPTCHA → POSTs to /api/auth/google-initiate.
 *  2. Server checks the token, then calls issueGrant() and sets a captcha-grant
 *     cookie on the response (HttpOnly, SameSite=Strict, 2-min TTL).
 *  3. Client calls signIn("google") → browser sends the cookie automatically
 *     to /api/auth/signin/google (same origin).
 *  4. Server calls verifyGrant() on that cookie; rejects with 403 if missing
 *     or invalid — blocks attackers who POST directly without a valid grant.
 *
 * Security properties:
 *  - HttpOnly + SameSite=Strict: cookie cannot be read or sent cross-site.
 *  - HMAC-SHA256 over SESSION_SECRET: value cannot be forged without the secret.
 *  - Short TTL (2 min): limits the reuse window if a grant were somehow leaked.
 *  - timingSafeEqual: HMAC comparison is constant-time to prevent timing attacks.
 */

import crypto from "crypto";

const GRANT_TTL_MS = 2 * 60_000; // 2 minutes

/** Returns the HMAC signing secret, failing closed in production. */
function signingSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV !== "production") {
      return "dev-captcha-grant-secret-not-for-production";
    }
    throw new Error("[captcha-grant] SESSION_SECRET is not set in production");
  }
  return s;
}

/**
 * Issue a fresh CAPTCHA grant.
 * Returns the cookie value string and the Max-Age in seconds.
 */
export function issueGrant(): { value: string; maxAgeSeconds: number } {
  const timestamp = Date.now().toString();
  const hmac = crypto
    .createHmac("sha256", signingSecret())
    .update(`captcha-grant:${timestamp}`)
    .digest("hex");
  return {
    value: `${timestamp}.${hmac}`,
    maxAgeSeconds: GRANT_TTL_MS / 1000,
  };
}

/**
 * Verify a captcha-grant cookie value.
 * Returns true only when the HMAC is valid and the grant is not older than
 * GRANT_TTL_MS milliseconds.
 */
export function verifyGrant(grant: string | null | undefined): boolean {
  if (!grant) return false;
  try {
    const dot = grant.indexOf(".");
    if (dot === -1) return false;

    const timestamp = grant.slice(0, dot);
    const hmac = grant.slice(dot + 1);

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Date.now() - ts > GRANT_TTL_MS) return false;

    // SHA-256 HMAC is always 64 lowercase hex characters.
    if (hmac.length !== 64 || !/^[0-9a-f]+$/.test(hmac)) return false;

    const expected = crypto
      .createHmac("sha256", signingSecret())
      .update(`captcha-grant:${timestamp}`)
      .digest("hex");

    const a = Buffer.from(hmac, "hex");
    const b = Buffer.from(expected, "hex");

    // Both buffers are 32 bytes (sha256); lengths always equal here.
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Cookie name used across the grant issue/verify pair. */
export const GRANT_COOKIE_NAME = "captcha-grant";
