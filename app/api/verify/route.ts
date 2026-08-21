import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, type DbUser } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

// ── Per-IP rate limiting ──────────────────────────────────────────────────────
// 10 verification attempts per IP per 15 minutes.  Higher than forgot-password
// since verification links arrive via email and are less abuse-prone.
const verifyLimiter = createRateLimiter(10, 15 * 60_000);

/**
 * Extract the trusted client IP from proxy headers.
 * See app/api/signup/route.ts for the full trust-model rationale.
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

export async function GET(req: Request) {
  const { limited, retryAfterMs } = verifyLimiter.check(clientIp(req));
  if (limited) return rateLimitResponse(retryAfterMs);

  const token = new URL(req.url).searchParams.get("token") ?? "";
  const base = getBaseUrl();
  if (!token) return NextResponse.redirect(`${base}/?verify=invalid`);

  const { rows } = await db.query<DbUser>(
    "SELECT * FROM users WHERE verification_token = $1",
    [crypto.createHash("sha256").update(token).digest("hex")]
  );
  const user = rows[0];
  if (!user) return NextResponse.redirect(`${base}/?verify=invalid`);
  if (user.verification_expires && new Date(user.verification_expires) < new Date()) {
    return NextResponse.redirect(`${base}/?verify=expired`);
  }

  await db.query(
    "UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE id = $1",
    [user.id]
  );
  sendWelcomeEmail(user.email, user.name ?? "").catch((e) => console.error("Welcome email failed:", e));
  return NextResponse.redirect(`${base}/?verify=success`);
}
