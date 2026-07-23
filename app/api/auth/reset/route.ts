import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db, type DbUser } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !token) {
      return NextResponse.json({ error: "Invalid reset link." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
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
