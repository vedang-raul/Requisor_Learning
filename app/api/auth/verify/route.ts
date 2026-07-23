import { NextResponse } from "next/server";
import crypto from "crypto";
import { db, type DbUser } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/base-url";

export async function GET(req: Request) {
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
