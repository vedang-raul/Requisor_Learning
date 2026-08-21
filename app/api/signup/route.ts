import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, roleForEmail } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

// ── Per-IP rate limiting ──────────────────────────────────────────────────────
// 10 signup attempts per IP per 15 minutes.  Stops automated account-creation
// floods before they reach the DB or email queue.
const signupLimiter = createRateLimiter(10, 15 * 60_000);

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
  // Rate-limit by IP before any body parsing, DB access, or email dispatch.
  const { limited, retryAfterMs } = signupLimiter.check(clientIp(req));
  if (limited) return rateLimitResponse(retryAfterMs, { json: true });

  try {
    const { name, email, password, employmentType, position } = await req.json().catch(() => ({}));
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanName = typeof name === "string" ? name.trim() : "";
    const validTypes = ["intern", "job", "student", "faculty"];
    const cleanType = typeof employmentType === "string" && validTypes.includes(employmentType.toLowerCase()) ? employmentType.toLowerCase() : "";
    const cleanPosition = typeof position === "string" ? position.trim() : "";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!cleanName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    if (!cleanType) return NextResponse.json({ error: "Select a valid employment type." }, { status: 400 });
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const existing = await db.query<{
      id: number;
      name: string | null;
      email_verified: boolean;
      verification_expires: string | null;
    }>(
      "SELECT id, name, email_verified, verification_expires FROM users WHERE email = $1",
      [cleanEmail]
    );
    const existingRow = existing.rows[0];

    if (existingRow?.email_verified) {
      return NextResponse.json({ error: "An account with this email already exists. Try logging in." }, { status: 409 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 3600 * 1000);

    if (existingRow) {
      // An unverified account already exists. Refresh only the verification
      // token — never overwrite the stored credentials — to prevent an
      // attacker from hijacking a pending registration by re-submitting the
      // form with their own password.
      await db.query(
        `UPDATE users
         SET verification_token = $1, verification_expires = $2
         WHERE id = $3`,
        [sha256(token), expires, existingRow.id]
      );
      await sendVerificationEmail(cleanEmail, existingRow.name ?? cleanName, token);
    } else {
      // Brand-new registration.
      const hash = await bcrypt.hash(password, 12);
      await db.query(
        `INSERT INTO users (email, name, password_hash, role, employment_type, position, verification_token, verification_expires)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [cleanEmail, cleanName, hash, roleForEmail(cleanEmail), cleanType, cleanPosition, sha256(token), expires]
      );
      await sendVerificationEmail(cleanEmail, cleanName, token);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Signup failed:", e);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
