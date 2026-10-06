import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, roleForEmail } from "@/lib/db";
import { sendVerificationEmail, skipEmailVerification } from "@/lib/email";
import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import {
  InvalidJsonBodyError,
  readJsonBody,
  RequestBodyTooLargeError,
} from "@/lib/request-body";

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const SIGNUP_BODY_MAX_BYTES = 16 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_BYTES = 72; // bcrypt's maximum effective password length
const MAX_EMPLOYMENT_TYPE_LENGTH = 32;
const MAX_POSITION_LENGTH = 240;
const MAX_TURNSTILE_TOKEN_LENGTH = 4096;
const MAX_ACCOUNT_TYPE_LENGTH = 16;
const SIGNUP_FIELDS = new Set([
  "name",
  "email",
  "password",
  "employmentType",
  "position",
  "accountType",
  "turnstileToken",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

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

  let body: unknown;
  try {
    body = await readJsonBody(req, SIGNUP_BODY_MAX_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    if (error instanceof InvalidJsonBodyError) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isObject(body) || Object.keys(body).some((key) => !SIGNUP_FIELDS.has(key))) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { name, email, password, employmentType, position, accountType, turnstileToken } = body;
  if (
    (typeof name !== "string" && name !== undefined) ||
    (typeof email !== "string" && email !== undefined) ||
    (typeof password !== "string" && password !== undefined) ||
    (typeof employmentType !== "string" && employmentType !== undefined) ||
    (typeof position !== "string" && position !== undefined) ||
    (typeof accountType !== "string" && accountType !== undefined) ||
    (typeof turnstileToken !== "string" && turnstileToken !== undefined) ||
    (typeof name === "string" && name.length > MAX_NAME_LENGTH) ||
    (typeof email === "string" && email.length > MAX_EMAIL_LENGTH) ||
    (typeof password === "string" && Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) ||
    (typeof employmentType === "string" && employmentType.length > MAX_EMPLOYMENT_TYPE_LENGTH) ||
    (typeof position === "string" && position.length > MAX_POSITION_LENGTH) ||
    (typeof accountType === "string" && accountType.length > MAX_ACCOUNT_TYPE_LENGTH) ||
    (typeof turnstileToken === "string" && turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH)
  ) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let emailStep = false; // true once the account is saved and only the email is left
  try {
    // Turnstile CAPTCHA — verify before any DB access or email dispatch.
    const { success: captchaOk } = await verifyTurnstile(
      typeof turnstileToken === "string" ? turnstileToken : null
    );
    if (!captchaOk) {
      return NextResponse.json(
        { error: "Bot check failed — please try again." },
        { status: 403 }
      );
    }

    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanName = typeof name === "string" ? name.trim() : "";
    const validTypes = ["intern", "job", "student", "faculty"];
    const cleanType = typeof employmentType === "string" && validTypes.includes(employmentType.toLowerCase()) ? employmentType.toLowerCase() : "";
    const cleanPosition = typeof position === "string" ? position.trim() : "";
    // Public registration never grants a privileged role. Keep accepting the
    // legacy accountType field so older clients continue to register, but
    // treat it only as presentation metadata and never as authorization.
    const requestedAccountType =
      accountType === undefined ? "employee" : typeof accountType === "string" ? accountType.toLowerCase() : "";
    if (requestedAccountType !== "employee" && requestedAccountType !== "tutor") {
      return NextResponse.json({ error: "Select a valid account type." }, { status: 400 });
    }

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
      password_hash: string | null;
    }>(
      "SELECT id, name, email_verified, verification_expires, password_hash FROM users WHERE email = $1",
      [cleanEmail]
    );
    const existingRow = existing.rows[0];

    if (existingRow?.email_verified) {
      return NextResponse.json({ error: "An account with this email already exists. Try logging in." }, { status: 409 });
    }

    // Testing switch (see lib/email.ts): no email, the account is usable at once.
    if (skipEmailVerification()) {
      if (existingRow) {
        // A half-finished registration: only its own password may finish it,
        // so nobody can take over someone else's pending account.
        const same = existingRow.password_hash ? await bcrypt.compare(password, existingRow.password_hash) : false;
        if (!same) return NextResponse.json({ error: "An account with this email already exists. Try logging in." }, { status: 409 });
        await db.query("UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE id = $1", [existingRow.id]);
      } else {
        await db.query(
          `INSERT INTO users (email, name, password_hash, role, employment_type, position, email_verified)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
          [cleanEmail, cleanName, await bcrypt.hash(password, 12), roleForEmail(cleanEmail) === "admin" ? "admin" : "employee", cleanType, cleanPosition]
        );
      }
      return NextResponse.json({ ok: true, verified: true });
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
      emailStep = true;
      await sendVerificationEmail(cleanEmail, existingRow.name ?? cleanName, token);
    } else {
      // Brand-new registration.
      const hash = await bcrypt.hash(password, 12);
      await db.query(
        `INSERT INTO users (email, name, password_hash, role, employment_type, position, verification_token, verification_expires)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          cleanEmail,
          cleanName,
          hash,
          roleForEmail(cleanEmail) === "admin" ? "admin" : "employee",
          cleanType,
          cleanPosition,
          sha256(token),
          expires,
        ]
      );
      emailStep = true;
      await sendVerificationEmail(cleanEmail, cleanName, token);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (emailStep) {
      // The account is saved; only the email didn't go. Say so, so the person
      // doesn't think nothing happened, and so the log names the real cause
      // (wrong key, unverified sender, blocked IP…).
      console.error("Signup email failed:", e instanceof Error ? e.message : e);
      return NextResponse.json(
        { error: "Your account was created, but we couldn't send the verification email. Please try again in a few minutes, or contact support." },
        { status: 502 }
      );
    }
    console.error("Signup failed:", e);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
