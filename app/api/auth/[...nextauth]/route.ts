import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

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
  // Only the credentials sign-in path is rate-limited.
  const url = new URL(req.url);
  if (url.pathname.includes("/callback/credentials")) {
    const ip = clientIp(req);
    const { limited, retryAfterMs } = loginLimiter.check(ip);
    if (limited) return rateLimitResponse(retryAfterMs);
  }

  return handler(req, ctx) as Promise<Response>;
}
