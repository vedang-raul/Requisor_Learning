import { createHash, timingSafeEqual } from "node:crypto";
import type { Access, MembershipRow } from "./roles";

export const TEST_ACCOUNT_PROVIDER = "protected-test-accounts";
export const TEST_ACCOUNTS = {
  student: { email: "test-student@requisor.invalid", name: "Test Student", role: "employee" },
  "university-admin": { email: "test-university-admin@requisor.invalid", name: "Test University Admin", role: "admin" },
  "super-admin": { email: "test-super-admin@requisor.invalid", name: "Test Super Admin", role: "admin" },
} as const;
export type TestAccountKind = keyof typeof TEST_ACCOUNTS;

export function testAccountsEnabled(): boolean {
  const password = process.env.TEST_ACCOUNT_PASSWORD;
  return process.env.TEST_ACCOUNT_LOGINS === "on"
    && typeof password === "string" && password.length >= 16 && password.length <= 256;
}

/** Never return a configured credential or its digest to a browser. */
export function testAccountPasswordMatches(value: unknown): boolean {
  if (!testAccountsEnabled() || typeof value !== "string" || value.length < 16 || value.length > 256) return false;
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(value), digest(process.env.TEST_ACCOUNT_PASSWORD!));
}

/** Server-only session marker; rotating the password invalidates these sessions. */
export function testAccountVersion(): string {
  return testAccountsEnabled()
    ? createHash("sha256").update(process.env.TEST_ACCOUNT_PASSWORD!).digest("hex")
    : "";
}

export function isTestAccountKind(value: unknown): value is TestAccountKind {
  return typeof value === "string" && Object.hasOwn(TEST_ACCOUNTS, value);
}

/** Called only for sessions issued by the password-protected provider. */
export function testAccountAccess(email: string, row: MembershipRow | undefined): Access | null {
  if (!testAccountsEnabled() || !row) return null;
  if (email === TEST_ACCOUNTS["super-admin"].email && row.role === "admin") {
    return { role: "admin", superAdmin: true, universityId: null, pending: false };
  }
  const universityId = row.university_status === "active" && Number.isSafeInteger(row.university_id)
    ? row.university_id : null;
  if (!universityId) return null;
  if (email === TEST_ACCOUNTS["university-admin"].email && row.role === "admin") {
    return { role: "admin", superAdmin: false, universityId, pending: false };
  }
  if (email === TEST_ACCOUNTS.student.email && row.role === "employee") {
    return { role: "employee", superAdmin: false, universityId, pending: false };
  }
  return null;
}
