import { after, NextResponse } from "next/server";
import crypto from "crypto";
import { db, type DbUser } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";

const RESET_EMAIL_COOLDOWN_MINUTES = 10;
const MAX_FORGOT_REQUEST_BYTES = 4 * 1024;
const MAX_EMAIL_LENGTH = 254;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await readJsonBody(req, MAX_FORGOT_REQUEST_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
      }
      if (error instanceof InvalidJsonBodyError) {
        return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
      }
      throw error;
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
    const { email } = body;
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (
      !cleanEmail
      || cleanEmail.length > MAX_EMAIL_LENGTH
      || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)
    ) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 3600 * 1000);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Claim the cooldown atomically before sending. This prevents concurrent
    // requests from both passing a read-then-write check and preserves the
    // same response for existing and unknown addresses.
    const { rows } = await db.query<Pick<DbUser, "email" | "name">>(
      `UPDATE users
       SET reset_token = $1,
           reset_expires = $2,
           reset_requested_at = NOW()
       WHERE email = $3
         AND password_hash IS NOT NULL
         AND (
           reset_requested_at IS NULL
           OR reset_requested_at <= NOW() - ($4 * INTERVAL '1 minute')
         )
       RETURNING email, name`,
      [tokenHash, expires, cleanEmail, RESET_EMAIL_COOLDOWN_MINUTES]
    );
    const user = rows[0];
    if (user) {
      // Run delivery after the generic response has been prepared so email
      // latency cannot reveal whether an address was eligible for a reset.
      after(async () => {
        try {
          await sendPasswordResetEmail(user.email, user.name ?? "", token);
        } catch (error) {
          console.error("Password-reset email failed:", error);
        }
      });
    }
    // Always succeed to avoid leaking which emails exist.
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Forgot-password failed:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
