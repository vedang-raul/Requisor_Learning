import { db } from "./db";
import { emailDomain } from "../auth/roles";
import { notifyUser } from "./notifications";
import { UNIVERSITY_THEME_TABLES } from "./feature-tables";
import { readTheme, type UniversityTheme } from "../theme/university-theme";
import { FONT_FORMATS, type FontUpload } from "../theme/font-upload";

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
 * Where a new account belongs:
 *  - an email on one of a university's registered domains joins it at once —
 *    but only when owning that address is proven (`emailProven`: verified by
 *    link or by Google). With email verification switched off for testing,
 *    the domain proves nothing, so it waits for approval instead;
 *  - a university picked from the list (any other email) is a request that
 *    waits for that university's admin, with no access until approved;
 *  - otherwise no university.
 * Asking to teach is separate and also waits for the admin (requested_role).
 */
export async function membershipForNewAccount(
  email: string,
  chosen: unknown,
  { emailProven }: { emailProven: boolean },
): Promise<{ universityId: number | null; status: "active" | "pending" | null }> {
  const byDomain = await universityIdForEmail(email);
  if (byDomain) return { universityId: byDomain, status: emailProven ? "active" : "pending" };
  const chosenId = Number(chosen);
  if (Number.isSafeInteger(chosenId) && chosenId > 0 && (await getUniversity(chosenId))) return { universityId: chosenId, status: "pending" };
  return { universityId: null, status: null };
}

/** Tells a university's admins someone is waiting to join. Best-effort: never fails the caller. */
export async function notifyAdminsOfJoinRequest(universityId: number, person: { name: string; email: string }): Promise<void> {
  try {
    const { rows } = await db.query<{ id: number }>(
      "SELECT id FROM users WHERE role = 'admin' AND university_id = $1 AND university_status = 'active'",
      [universityId]
    );
    await Promise.all(rows.map((admin) => notifyUser(admin.id, {
      kind: "join-request",
      title: "New request to join",
      body: `${person.name || person.email} (${person.email}) is waiting for your approval.`,
      link: "/app/admin/",
    })));
  } catch {
    console.error("Join-request notification failed.");
  }
}

// ── Themes ──────────────────────────────────────────────────────────────────
// Read on every app page a member opens, so kept in memory for a minute. A
// theme saved here takes effect at once; one saved by another server copy
// within a minute.
let themeTables: Promise<unknown> | null = null;
const ensureThemeTables = () => (themeTables ??= db.query(UNIVERSITY_THEME_TABLES).catch((error) => { themeTables = null; throw error; }));

/** An uploaded font as the page uses it: its CSS format, and a version that changes when the file does. */
export type UploadedFont = { name: string; format: string; version: number };
type Look = { theme: UniversityTheme | null; font: UploadedFont | null };
const lookCache = new Map<number, { at: number; look: Look }>();
const THEME_CACHE_MS = 60_000;

const uploadedFont = (row: { name: string; format: string; updated_at: Date } | undefined): UploadedFont | null => {
  const spec = row && FONT_FORMATS[row.format as keyof typeof FONT_FORMATS];
  return row && spec ? { name: row.name, format: spec.css, version: new Date(row.updated_at).getTime() } : null;
};

/** A university's theme for its members (null: Requisor's look), and its uploaded font if it has one. */
export async function universityLook(id: number): Promise<Look> {
  if (!Number.isSafeInteger(id) || id < 1) return { theme: null, font: null };
  const cached = lookCache.get(id);
  if (cached && Date.now() - cached.at < THEME_CACHE_MS) return cached.look;
  await ensureThemeTables();
  const { rows } = await db.query<{ theme: unknown; name: string | null; format: string | null; font_updated: Date | null }>(
    `SELECT u.theme, f.name, f.format, f.updated_at AS font_updated
       FROM universities u LEFT JOIN university_fonts f ON f.university_id = u.id WHERE u.id = $1`, [id]);
  const row = rows[0];
  const look: Look = {
    theme: readTheme(row?.theme),
    font: row?.name && row.format && row.font_updated ? uploadedFont({ name: row.name, format: row.format, updated_at: row.font_updated }) : null,
  };
  lookCache.set(id, { at: Date.now(), look });
  return look;
}

/** Every university's theme and uploaded font, for the super admin's list. */
export async function allUniversityLooks(): Promise<{ themes: Map<number, UniversityTheme>; fonts: Map<number, UploadedFont> }> {
  await ensureThemeTables();
  const [themes, fonts] = await Promise.all([
    db.query<{ id: number; theme: unknown }>("SELECT id, theme FROM universities WHERE theme IS NOT NULL"),
    db.query<{ university_id: number; name: string; format: string; updated_at: Date }>("SELECT university_id, name, format, updated_at FROM university_fonts"),
  ]);
  return {
    themes: new Map(themes.rows.flatMap((r) => { const theme = readTheme(r.theme); return theme ? [[r.id, theme] as const] : []; })),
    fonts: new Map(fonts.rows.flatMap((r) => { const font = uploadedFont(r); return font ? [[r.university_id, font] as const] : []; })),
  };
}

/** Saves a university's theme, or removes it (null). False when there is no such university. */
export async function setUniversityTheme(id: number, theme: UniversityTheme | null): Promise<boolean> {
  await ensureThemeTables();
  const { rowCount } = await db.query("UPDATE universities SET theme = $2::jsonb, updated_at = NOW() WHERE id = $1", [id, theme ? JSON.stringify(theme) : null]);
  lookCache.delete(id);
  return (rowCount ?? 0) > 0;
}

/** Whether the university has an uploaded font. */
export async function hasUniversityFont(id: number): Promise<boolean> {
  await ensureThemeTables();
  return ((await db.query("SELECT 1 FROM university_fonts WHERE university_id = $1", [id])).rowCount ?? 0) > 0;
}

/**
 * Keeps an uploaded font for the university, replacing any earlier one; or, with
 * null, removes it, and a theme that used it goes back to Requisor's font.
 * False when there is no such university.
 */
export async function setUniversityFont(id: number, font: FontUpload | null): Promise<boolean> {
  await ensureThemeTables();
  if (!(await db.query("SELECT 1 FROM universities WHERE id = $1", [id])).rowCount) return false;
  if (font) {
    await db.query(
      `INSERT INTO university_fonts (university_id, name, format, data, updated_at) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (university_id) DO UPDATE SET name = EXCLUDED.name, format = EXCLUDED.format, data = EXCLUDED.data, updated_at = NOW()`,
      [id, font.name, font.format, font.data]);
  } else {
    await db.query("DELETE FROM university_fonts WHERE university_id = $1", [id]);
    await db.query(`UPDATE universities SET theme = jsonb_set(theme, '{font}', '"default"') WHERE id = $1 AND theme->>'font' = 'custom'`, [id]);
  }
  lookCache.delete(id);
  return true;
}

/** The uploaded font file, for serving. */
export async function universityFontFile(id: number): Promise<{ data: Buffer; mime: string } | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  await ensureThemeTables();
  const { rows } = await db.query<{ data: Buffer; format: string }>("SELECT data, format FROM university_fonts WHERE university_id = $1", [id]);
  const spec = rows[0] && FONT_FORMATS[rows[0].format as keyof typeof FONT_FORMATS];
  return rows[0] && spec ? { data: rows[0].data, mime: spec.mime } : null;
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
