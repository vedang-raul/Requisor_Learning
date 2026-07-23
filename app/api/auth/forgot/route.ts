import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, type DbUser } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({}));
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!cleanEmail) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });

    const { rows } = await db.query<DbUser>("SELECT * FROM users WHERE email = $1", [cleanEmail]);
    const user = rows[0];
    if (user && user.password_hash) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 3600 * 1000);
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await db.query("UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3", [tokenHash, expires, user.id]);
      await sendPasswordResetEmail(user.email, user.name ?? "", token);
    }
    // Always succeed to avoid leaking which emails exist.
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Forgot-password failed:", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
