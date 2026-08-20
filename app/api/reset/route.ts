import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, type DbUser } from "@/lib/db";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/request-body";

const MAX_RESET_REQUEST_BYTES = 4 * 1024;
const MAX_PASSWORD_LENGTH = 1024;
const RESET_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await readJsonBody(req, MAX_RESET_REQUEST_BYTES);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
      }
      if (error instanceof InvalidJsonBodyError) {
        return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });
      }
      throw error;
    }

    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });
    }
    const { token, password } = body;
    if (typeof token !== "string" || !RESET_TOKEN_PATTERN.test(token)) {
      return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
      return NextResponse.json({ error: "Password must be between 8 and 1024 characters." }, { status: 400 });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const { rows } = await db.query<DbUser>("SELECT * FROM users WHERE reset_token = $1", [tokenHash]);
    const user = rows[0];
    if (!user) return NextResponse.json({ error: "Invalid or already-used reset link." }, { status: 400 });
    if (user.reset_expires && new Date(user.reset_expires) < new Date()) {
      return NextResponse.json({ error: "This reset link has expired. Request a new one." }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 12);
    await db.query(
      "UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL, email_verified = TRUE WHERE id = $2",
      [hash, user.id]
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Reset failed:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
