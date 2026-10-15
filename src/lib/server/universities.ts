import { db } from "./db";
import { emailDomain } from "../auth/roles";

/**
 * Universities: the partners whose tutors and students use the platform. Super
 * admins add them; people join one at sign-up, by email domain or by picking it.
 */
export type University = { id: number; name: string; shortName: string; domains: string[]; logoUrl: string | null };

type UniversityRow = {
  id: number; name: string; short_name: string; email_domains: string[] | null;
  logo_path: string | null; has_logo_data: boolean; updated_at: Date;
};

const COLUMNS = "id, name, short_name, email_domains, logo_path, (logo_data IS NOT NULL) AS has_logo_data, updated_at";

/** Where the logo is shown from: an uploaded one through the logo route, else a file shipped with the site. */
function toUniversity(row: UniversityRow): University {
  const uploaded = row.has_logo_data ? `/api/universities/${row.id}/logo/?v=${new Date(row.updated_at).getTime()}` : null;
  return {
    id: row.id,
    name: row.name,
    shortName: row.short_name || row.name,
    domains: row.email_domains ?? [],
    logoUrl: uploaded ?? row.logo_path ?? null,
  };
}

export async function listUniversities(): Promise<University[]> {
  const { rows } = await db.query<UniversityRow>(`SELECT ${COLUMNS} FROM universities ORDER BY lower(name)`);
  return rows.map(toUniversity);
}

export async function getUniversity(id: number): Promise<University | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const { rows } = await db.query<UniversityRow>(`SELECT ${COLUMNS} FROM universities WHERE id = $1`, [id]);
  return rows[0] ? toUniversity(rows[0]) : null;
}

/** The university whose email domain matches this address, if any. */
export async function universityIdForEmail(email: string): Promise<number | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  const { rows } = await db.query<{ id: number }>("SELECT id FROM universities WHERE $1 = ANY(email_domains) ORDER BY id LIMIT 1", [domain]);
  return rows[0]?.id ?? null;
}

/**
 * Where a new account belongs. A matching email domain places the person at
 * once; picking a university without a matching email waits for that
 * university's admin to approve, so nobody can see a university's courses just
 * by choosing it.
 */
export async function membershipForNewAccount(email: string, chosen: unknown): Promise<{ universityId: number | null; status: "active" | "pending" | null }> {
  const byDomain = await universityIdForEmail(email);
  if (byDomain) return { universityId: byDomain, status: "active" };
  const chosenId = Number(chosen);
  if (Number.isSafeInteger(chosenId) && chosenId > 0 && (await getUniversity(chosenId))) return { universityId: chosenId, status: "pending" };
  return { universityId: null, status: null };
}

// ── Site settings ───────────────────────────────────────────────────────────

/** The partner shown on the public pages (landing and sign-in). */
export async function publicPartnerId(): Promise<number | null> {
  const { rows } = await db.query<{ value: unknown }>("SELECT value FROM site_settings WHERE key = 'public_partner'");
  const id = Number(rows[0]?.value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function setPublicPartnerId(id: number | null): Promise<void> {
  await db.query(
    `INSERT INTO site_settings (key, value, updated_at) VALUES ('public_partner', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(id)]
  );
}

/**
 * The partner to show someone: their own university when they belong to one,
 * otherwise the one super admins chose for the public pages. Null shows none.
 */
export async function partnerFor(universityId: number | null): Promise<University | null> {
  if (universityId) {
    const own = await getUniversity(universityId);
    if (own) return own;
  }
  const publicId = await publicPartnerId();
  return publicId ? getUniversity(publicId) : null;
}
