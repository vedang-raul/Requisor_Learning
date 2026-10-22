import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * The super admin's sign-in, set in the server's environment rather than the
 * database (in .env.local locally, as Secrets on the live deployment):
 *
 *   SUPER_ADMIN_LOGIN_EMAIL          e.g. support@requisor.io
 *   SUPER_ADMIN_LOGIN_PASSWORD_HASH  a bcrypt hash: `npm run hash-password` (recommended)
 *   SUPER_ADMIN_LOGIN_PASSWORD       or the password itself (12+ characters)
 *
 * For that email the environment is the only password; the database then
 * confirms the account (creating its row if needed) and that it is a super
 * admin. See the "Email & password" provider in src/lib/auth/auth.ts.
 */
export const MIN_PASSWORD_LENGTH = 12;

export function envSuperAdminEmail(): string | null {
  const email = process.env.SUPER_ADMIN_LOGIN_EMAIL?.trim().toLowerCase();
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function configuredSecret(): { hash: string } | { password: string } | null {
  const hash = process.env.SUPER_ADMIN_LOGIN_PASSWORD_HASH?.trim();
  if (hash && /^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) return { hash };
  const password = process.env.SUPER_ADMIN_LOGIN_PASSWORD;
  if (password && password.length >= MIN_PASSWORD_LENGTH) return { password };
  return null;
}

/**
 * "not-configured": this email doesn't use an environment login (check the database as usual).
 * "ok" / "wrong": it does, and the password matched or didn't.
 */
export async function checkEnvSuperAdmin(email: string, password: string): Promise<"not-configured" | "ok" | "wrong"> {
  const loginEmail = envSuperAdminEmail();
  if (!loginEmail || email !== loginEmail) return "not-configured";
  const secret = configuredSecret();
  if (!secret) {
    // An email without a usable password must not fall back to anything weaker.
    console.error(JSON.stringify({ event: "env_super_admin_login", outcome: "misconfigured" }));
    return "wrong";
  }
  if ("hash" in secret) return (await bcrypt.compare(password, secret.hash)) ? "ok" : "wrong";
  // Compare fixed-length digests, so timing reveals nothing about the password.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(password), digest(secret.password)) ? "ok" : "wrong";
}
