/**
 * Proposal preview links: a tutor shares chosen modules of one of their courses
 * with the readers of an employer proposal. Whoever has the link sees, without
 * signing in and for a limited time, only those modules' live lessons; the
 * other modules show as locked titles. Nothing else about the course or the
 * site goes into the page (see src/app/p/[token]/page.tsx).
 *
 * The link's code is random and stored only as a SHA-256 hash, so a database
 * read doesn't reveal working links. Links expire after PREVIEW_LINK_DAYS and
 * can be revoked.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/server/db";
import { getCourses } from "@/lib/courses/course-catalog";
import { PREVIEW_LINK_DAYS, pickPreviewModules, previewModuleChoices } from "@/lib/courses/preview-modules";
import type { Course } from "@/lib/types";

export { PREVIEW_LINK_DAYS };
/** At most this many links per course that are still open, so a leaked session can't mint them without end. */
export const MAX_OPEN_LINKS_PER_COURSE = 50;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export const newPreviewToken = () => randomBytes(32).toString("base64url");
export const isPreviewToken = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);
export const hashPreviewToken = (token: string) => createHash("sha256").update(token).digest("hex");

// ── Storage ─────────────────────────────────────────────────────────────────
let schemaPromise: Promise<void> | undefined;

/** Creates the links table where it doesn't exist yet (also in scripts/migrate.js). */
export function ensurePreviewLinks(): Promise<void> {
  schemaPromise ??= db.query(`
    CREATE TABLE IF NOT EXISTS course_preview_links (
      id SERIAL PRIMARY KEY,
      token_hash CHAR(64) NOT NULL UNIQUE,
      course_slug VARCHAR(80) NOT NULL REFERENCES courses(slug) ON DELETE CASCADE,
      module_keys JSONB NOT NULL,
      label VARCHAR(160) NOT NULL DEFAULT '',
      created_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      view_count INT NOT NULL DEFAULT 0,
      last_viewed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS course_preview_links_course_idx ON course_preview_links (course_slug);
  `).then(() => undefined).catch((error) => { schemaPromise = undefined; throw error; });
  return schemaPromise;
}

export type PreviewLinkSummary = {
  id: number; label: string; modules: string[]; createdAt: string; expiresAt: string;
  revoked: boolean; expired: boolean; views: number; lastViewedAt: string | null;
};
type LinkRow = { id: number; label: string; module_keys: unknown; created_at: Date; expires_at: Date; revoked_at: Date | null; view_count: number; last_viewed_at: Date | null };

const summary = (row: LinkRow, titles: Map<string, string>, now: number): PreviewLinkSummary => ({
  id: row.id,
  label: row.label,
  modules: (Array.isArray(row.module_keys) ? row.module_keys : []).filter((k): k is string => typeof k === "string").map((k) => titles.get(k) ?? "(a module that was renamed or removed)"),
  createdAt: row.created_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  revoked: row.revoked_at !== null,
  expired: row.expires_at.getTime() <= now,
  views: row.view_count,
  lastViewedAt: row.last_viewed_at?.toISOString() ?? null,
});

/** A course's links, newest first. The caller has checked the person manages the course. */
export async function listPreviewLinks(course: Course, now = Date.now()): Promise<PreviewLinkSummary[]> {
  await ensurePreviewLinks();
  const { rows } = await db.query<LinkRow>(
    `SELECT id, label, module_keys, created_at, expires_at, revoked_at, view_count, last_viewed_at
       FROM course_preview_links WHERE course_slug=$1 ORDER BY created_at DESC, id DESC LIMIT 100`, [course.slug]);
  const titles = new Map(previewModuleChoices(course, now).map((c) => [c.key, c.title]));
  return rows.map((row) => summary(row, titles, now));
}

export type CreateResult = { ok: true; token: string; link: PreviewLinkSummary } | { ok: false; error: string };

/** Makes a link to the chosen modules. The caller has checked the person manages the course. */
export async function createPreviewLink(course: Course, requested: unknown, label: unknown, userId: number, now = Date.now()): Promise<CreateResult> {
  const keys = pickPreviewModules(course, requested, now);
  if (!keys) return { ok: false, error: "Choose at least one module that has lessons learners can see." };
  await ensurePreviewLinks();
  const open = await db.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM course_preview_links WHERE course_slug=$1 AND revoked_at IS NULL AND expires_at > NOW()", [course.slug]);
  if ((open.rows[0]?.n ?? 0) >= MAX_OPEN_LINKS_PER_COURSE) return { ok: false, error: "This course has too many open preview links. Revoke some first." };
  const token = newPreviewToken();
  const name = typeof label === "string" ? label.trim().replace(/\s+/g, " ").slice(0, 160) : "";
  const { rows } = await db.query<LinkRow>(
    `INSERT INTO course_preview_links (token_hash, course_slug, module_keys, label, created_by, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, NOW() + make_interval(days => $6))
     RETURNING id, label, module_keys, created_at, expires_at, revoked_at, view_count, last_viewed_at`,
    [hashPreviewToken(token), course.slug, JSON.stringify(keys), name, userId, PREVIEW_LINK_DAYS]);
  return { ok: true, token, link: summary(rows[0], new Map(previewModuleChoices(course, now).map((c) => [c.key, c.title])), now) };
}

/** Revokes one of the course's links. */
export async function revokePreviewLink(courseSlug: string, id: number): Promise<boolean> {
  await ensurePreviewLinks();
  const { rowCount } = await db.query(
    "UPDATE course_preview_links SET revoked_at=COALESCE(revoked_at, NOW()) WHERE id=$1 AND course_slug=$2", [id, courseSlug]);
  return (rowCount ?? 0) > 0;
}

/**
 * Opens a link: the course's slug and the modules it shows, when the link is
 * real, not revoked and not expired; null otherwise (all the same to the caller,
 * so the page can't be used to tell which). Counts the visit.
 */
export async function openPreviewLink(token: unknown): Promise<{ courseSlug: string; keys: string[]; expiresAt: Date } | null> {
  if (!isPreviewToken(token)) return null;
  await ensurePreviewLinks();
  const { rows } = await db.query<{ course_slug: string; module_keys: unknown; expires_at: Date }>(
    `UPDATE course_preview_links SET view_count = view_count + 1, last_viewed_at = NOW()
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > NOW()
      RETURNING course_slug, module_keys, expires_at`, [hashPreviewToken(token)]);
  const row = rows[0];
  if (!row || !Array.isArray(row.module_keys)) return null;
  return { courseSlug: row.course_slug, keys: row.module_keys.filter((k): k is string => typeof k === "string"), expiresAt: row.expires_at };
}

export type MyPreviewLink = PreviewLinkSummary & { course: { slug: string; title: string } };

/**
 * Every link this person made, across all their courses, newest first. Module
 * names come from the course as it is now. Links of a deleted course are gone
 * with it (the table cascades).
 */
export async function listMyPreviewLinks(userId: number, now = Date.now()): Promise<MyPreviewLink[]> {
  await ensurePreviewLinks();
  const { rows } = await db.query<LinkRow & { course_slug: string }>(
    `SELECT id, course_slug, label, module_keys, created_at, expires_at, revoked_at, view_count, last_viewed_at
       FROM course_preview_links WHERE created_by=$1 ORDER BY created_at DESC, id DESC LIMIT 500`, [userId]);
  if (!rows.length) return [];
  const courses = new Map((await getCourses("WHERE c.slug = ANY($1::text[])", [[...new Set(rows.map((r) => r.course_slug))]])).map((c) => [c.slug, c]));
  const titles = new Map([...courses].map(([slug, c]) => [slug, new Map(previewModuleChoices(c, now).map((m) => [m.key, m.title]))]));
  return rows.map((row) => ({
    ...summary(row, titles.get(row.course_slug) ?? new Map(), now),
    course: { slug: row.course_slug, title: courses.get(row.course_slug)?.title ?? row.course_slug },
  }));
}

/** Turns off one of this person's own links, whichever course it's for. */
export async function revokeMyPreviewLink(id: number, userId: number): Promise<boolean> {
  await ensurePreviewLinks();
  const { rowCount } = await db.query(
    "UPDATE course_preview_links SET revoked_at=COALESCE(revoked_at, NOW()) WHERE id=$1 AND created_by=$2", [id, userId]);
  return (rowCount ?? 0) > 0;
}
