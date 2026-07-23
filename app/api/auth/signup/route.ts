import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
import { db, roleForEmail } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { name, email, password, employmentType, position } = await req.json().catch(() => ({}));
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanType = typeof employmentType === "string" && ["intern", "job"].includes(employmentType.toLowerCase()) ? employmentType.toLowerCase() : "";
    const cleanPosition = typeof position === "string" ? position.trim() : "";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!cleanName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    if (!cleanType) return NextResponse.json({ error: "Select a valid employment type." }, { status: 400 });
    if (!cleanPosition) return NextResponse.json({ error: "Enter your position." }, { status: 400 });
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    // Only a fully verified account blocks signup; unverified accounts may
    // re-sign-up to get a fresh verification link.
    const existing = await db.query("SELECT id, email_verified FROM users WHERE email = $1", [cleanEmail]);
    if (existing.rows[0]?.email_verified) {
      return NextResponse.json({ error: "An account with this email already exists. Try logging in." }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 3600 * 1000);

    await db.query(
      `INSERT INTO users (email, name, password_hash, role, employment_type, position, verification_token, verification_expires)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
             employment_type = EXCLUDED.employment_type, position = EXCLUDED.position,
             verification_token = EXCLUDED.verification_token, verification_expires = EXCLUDED.verification_expires`,
      [cleanEmail, cleanName, hash, roleForEmail(cleanEmail), cleanType, cleanPosition, sha256(token), expires]
    );

    await sendVerificationEmail(cleanEmail, cleanName, token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Signup failed:", e);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
