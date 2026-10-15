/**
 * Who can do what, platform-wide.
 *
 *   super admin   the Requisor team. Sees and manages every university.
 *   admin         one university's administrator. Manages that university only.
 *   tutor         teaches at a university.
 *   student       learns ("employee" in the database, from the platform's first version).
 *
 * In the database and session a super admin is an admin (role "admin") whose
 * email is on the server's SUPER_ADMIN_EMAILS list, so every existing admin
 * check keeps working; the university limits are added on top. Nobody can make
 * themselves a super admin from inside the app.
 */

/** The support mailbox is always a super admin. */
export const FOUNDING_SUPER_ADMIN = "support@requisor.io";

export type SessionRole = "employee" | "tutor" | "admin";

/** The super admin emails: SUPER_ADMIN_EMAILS (comma or space separated) plus the support mailbox. */
export function superAdminEmails(): Set<string> {
  const listed = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  return new Set([FOUNDING_SUPER_ADMIN, ...listed]);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && superAdminEmails().has(String(email).trim().toLowerCase());
}

export type MembershipRow = {
  role: string | null;
  university_id: number | null;
  university_status: string | null;
};

/** What a person may do, worked out from their account. */
export type Access = { role: SessionRole; superAdmin: boolean; universityId: number | null };

/**
 * A person's access, from their email and account row. A university admin must
 * belong to a university; an "admin" row without one is treated as a student,
 * so a stray database value never grants platform-wide power.
 */
export function accessFor(email: string, row: MembershipRow | null | undefined): Access {
  if (isSuperAdminEmail(email)) return { role: "admin", superAdmin: true, universityId: null };
  const universityId = row?.university_status === "active" && Number.isSafeInteger(row.university_id) ? row.university_id : null;
  if (row?.role === "admin" && universityId) return { role: "admin", superAdmin: false, universityId };
  if (row?.role === "tutor") return { role: "tutor", superAdmin: false, universityId };
  return { role: "employee", superAdmin: false, universityId };
}

/** The university a person's work belongs to, or null for platform-wide (super admins, and people without one). */
export function workUniversity(access: Pick<Access, "superAdmin" | "universityId">): number | null {
  return access.superAdmin ? null : access.universityId;
}

/** The roles a manager may give someone. A university admin can't create admins; a super admin can. */
export function assignableRoles(manager: Pick<Access, "superAdmin">): SessionRole[] {
  return manager.superAdmin ? ["employee", "tutor", "admin"] : ["employee", "tutor"];
}

/** The email domain, for matching a person to a university. */
export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

/** Cleans a list of email domains typed by a super admin: "@MSOE.edu, msoe.edu" -> ["msoe.edu"]. */
export function cleanDomains(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,;]+/) : [];
  const out = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const domain = value.trim().toLowerCase().replace(/^@/, "");
    if (/^(?=.{3,100}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) out.add(domain);
  }
  return [...out].slice(0, 10);
}
