import { db, ADMIN_EMAIL, type DbUser } from "../server/db";
import { accessFor, type MembershipRow } from "./roles";

/**
 * "View as": a signed-in super admin can switch into a reserved test account
 * (student, tutor or university admin) from their Profile page, and back.
 * There are no public test logins: only a super admin's own session can
 * start a switch, and only into these synthetic accounts — never a real
 * person's. See the "view-as" provider in src/lib/auth/auth.ts.
 */
import { isViewAsKind, VIEW_AS_KINDS, VIEW_AS_PROVIDER, type ViewAsKind } from "./view-as-shared";
export { isViewAsKind, VIEW_AS_KINDS, VIEW_AS_PROVIDER, type ViewAsKind };

export const TEST_TUTOR_EMAIL = "dev-tutor@requisor.local";
export const TEST_UNIVERSITY_ADMIN_EMAIL = "dev-uni-admin@requisor.local";
export function testStudentEmail(): string {
  return process.env.DEV_STUDENT_EMAIL?.trim().toLowerCase() || "dev-student@requisor.local";
}

type SignedInUser = { id: string; email: string; name: string };
const asUser = (row: DbUser, fallbackName: string): SignedInUser =>
  ({ id: String(row.id), email: row.email, name: row.name ?? fallbackName });

/**
 * The reserved test accounts, created on first use. They have no password,
 * so they can only be entered through "view as" (or the local development
 * shortcuts).
 */
export async function testAccount(kind: ViewAsKind): Promise<SignedInUser | null> {
  if (kind === "student") {
    const email = testStudentEmail();
    if (email === ADMIN_EMAIL) return null;
    const { rows } = await db.query<DbUser>(
      `INSERT INTO users (email, name, email_verified, role)
       VALUES ($1, 'Test Student', TRUE, 'employee')
       ON CONFLICT (email) DO UPDATE SET email_verified = TRUE
       RETURNING *`,
      [email]
    );
    // Only ever a learner: never open a tutor or admin account this way.
    return rows[0]?.role === "employee" ? asUser(rows[0], "Test Student") : null;
  }
  if (kind === "tutor") {
    const { rows } = await db.query<DbUser>(
      `INSERT INTO users (email, name, email_verified, role)
       VALUES ($1, 'Test Tutor', TRUE, 'tutor')
       ON CONFLICT (email) DO UPDATE SET email_verified = TRUE, role = 'tutor'
       RETURNING *`,
      [TEST_TUTOR_EMAIL]
    );
    return rows[0] ? asUser(rows[0], "Test Tutor") : null;
  }
  // The admin of the first university, re-placed there on every switch.
  const { rows } = await db.query<DbUser>(
    `INSERT INTO users (email, name, email_verified, role, university_id, university_status)
     SELECT $1, 'Test University Admin', TRUE, 'admin', id, 'active' FROM universities ORDER BY id LIMIT 1
     ON CONFLICT (email) DO UPDATE
       SET email_verified = TRUE, role = 'admin', university_id = EXCLUDED.university_id, university_status = 'active'
     RETURNING *`,
    [TEST_UNIVERSITY_ADMIN_EMAIL]
  );
  // No university yet: there is nothing for it to administer.
  return rows[0] ? asUser(rows[0], "Test University Admin") : null;
}

/** The super admin behind a session, checked against the database right now; null if there isn't one. */
export async function superAdminById(id: unknown): Promise<SignedInUser | null> {
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const { rows } = await db.query<DbUser & MembershipRow>(
    "SELECT id, email, name, role, university_id, university_status FROM users WHERE id = $1",
    [userId]
  );
  const row = rows[0];
  if (!row || !accessFor(row.email, row)?.superAdmin) return null;
  return asUser(row, "Super admin");
}
