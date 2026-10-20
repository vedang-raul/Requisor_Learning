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

/**
 * What a person may do, worked out from their account. `pending` means they
 * asked to join a university and its admin hasn't approved them yet: they get
 * no access to anything until then (enforced in src/middleware.ts).
 */
export type Access = { role: SessionRole; superAdmin: boolean; universityId: number | null; pending: boolean };

/**
 * A person's access, from their email and account row. A university admin must
 * belong to a university; an "admin" row without one is treated as a student,
 * so a stray database value never grants platform-wide power.
 */
export function accessFor(email: string, row: MembershipRow | null | undefined): Access {
  if (isSuperAdminEmail(email)) return { role: "admin", superAdmin: true, universityId: null, pending: false };
  const pending = row?.university_status === "pending";
  const universityId = row?.university_status === "active" && Number.isSafeInteger(row.university_id) ? row.university_id : null;
  if (row?.role === "admin" && universityId) return { role: "admin", superAdmin: false, universityId, pending: false };
  if (row?.role === "tutor") return { role: "tutor", superAdmin: false, universityId, pending };
  return { role: "employee", superAdmin: false, universityId, pending };
}

/** The university a person's work belongs to, or null for platform-wide (super admins, and people without one). */
export function workUniversity(access: Pick<Access, "superAdmin" | "universityId">): number | null {
  return access.superAdmin ? null : access.universityId;
}

/** The roles a manager may give someone. A university admin can't create admins; a super admin can. */
export function assignableRoles(manager: Pick<Access, "superAdmin">): SessionRole[] {
  return manager.superAdmin ? ["employee", "tutor", "admin"] : ["employee", "tutor"];
}

/**
 * What the admin panel is called. University admins run one university; super
 * admins run every one, so the same page is named for whoever is looking.
 */
export function adminPanelLabel(superAdmin: boolean, { short = false } = {}): string {
  if (superAdmin) return short ? "Super Admin" : "Super Admin Panel";
  return short ? "University Admin" : "University Admin Panel";
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
  return [...out].slice(0, MAX_UNIVERSITY_DOMAINS);
}

/** A university can list several domains, e.g. msoe.edu and students.msoe.edu. Matching is exact. */
export const MAX_UNIVERSITY_DOMAINS = 25;

/**
 * Free email providers anyone can sign up with. Registering one for a
 * university would let every user of that provider join it, so the
 * Universities editor warns about these (it doesn't block — super admins decide).
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "ymail.com", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
  "zoho.com", "gmx.com", "gmx.net", "mail.com", "yandex.com", "yandex.ru", "rediffmail.com", "qq.com", "163.com",
  "126.com", "hey.com", "fastmail.com", "tutanota.com",
]);

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.trim().toLowerCase().replace(/^@/, ""));
}
