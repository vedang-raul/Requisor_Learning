export const runtime = "nodejs";

import { db } from "@/lib/server/db";
import { skipEmailVerification } from "@/lib/server/email";
import { requireAccess } from "@/lib/server/access";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { listUniversities, publicPartnerId, setPublicPartnerId } from "@/lib/server/universities";
import { MAX_LOGO_BYTES, readLogo, readUniversityInput } from "@/lib/server/university-input";

/**
 * Universities, for super admins.
 *   GET                                     -> { universities (with people and course counts), publicPartnerId }
 *   POST   { name, shortName, domains, logo? }       add one
 *   PATCH  { id, name?, shortName?, domains?, logo? }  change one; logo null removes an uploaded logo
 *   DELETE { id }                            remove one (its people and courses stay, without a university)
 *   PUT    { publicPartnerId }               which partner the public pages show (null for none)
 */
const MAX_REQUEST_BYTES = Math.ceil(MAX_LOGO_BYTES * 1.4) + 8_192;

async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const raw = await readJsonBody(req, MAX_REQUEST_BYTES);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "That logo is too large. Keep it under 512 KB." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
}

const isDuplicate = (error: unknown) => (error as { code?: string })?.code === "23505";

export async function GET() {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const [universities, counts, partner] = await Promise.all([
    listUniversities(),
    db.query<{ university_id: number; people: string; pending: string; courses: string }>(
      `SELECT un.id AS university_id,
              (SELECT COUNT(*) FROM users u WHERE u.university_id = un.id AND u.university_status = 'active') AS people,
              (SELECT COUNT(*) FROM users u WHERE u.university_id = un.id AND u.university_status = 'pending') AS pending,
              (SELECT COUNT(*) FROM courses c WHERE c.university_id = un.id) AS courses
         FROM universities un`
    ),
    publicPartnerId(),
  ]);
  const byId = new Map(counts.rows.map((r) => [r.university_id, r]));
  return Response.json({
    universities: universities.map((u) => ({
      ...u,
      people: Number(byId.get(u.id)?.people ?? 0),
      pending: Number(byId.get(u.id)?.pending ?? 0),
      courses: Number(byId.get(u.id)?.courses ?? 0),
    })),
    publicPartnerId: partner,
  });
}

export async function POST(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const input = readUniversityInput(body);
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 });
  const logo = body.logo === undefined || body.logo === null ? null : readLogo(body.logo);
  if (logo && "error" in logo) return Response.json({ error: logo.error }, { status: 400 });
  try {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO universities (name, short_name, email_domains, logo_data, logo_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.name, input.shortName, input.domains, logo?.data ?? null, logo?.type ?? null]
    );
    await adoptMatchingAccounts(rows[0].id, input.domains);
    return Response.json({ id: rows[0].id }, { status: 201 });
  } catch (error) {
    if (isDuplicate(error)) return Response.json({ error: "A university with that name already exists." }, { status: 409 });
    throw error;
  }
}

/**
 * People who already signed up with one of the university's domains, and
 * aren't in any university, join it — only with a verified address. With
 * verification switched off for testing, "verified" proves nothing, so they
 * wait for the admin instead (same rule as sign-up).
 */
async function adoptMatchingAccounts(universityId: number, domains: string[]): Promise<void> {
  if (!domains.length) return;
  await db.query(
    `UPDATE users SET university_id = $1, university_status = $3
      WHERE university_id IS NULL AND email_verified = TRUE AND role <> 'admin'
        AND split_part(lower(email), '@', 2) = ANY($2::text[])`,
    [universityId, domains, skipEmailVerification() ? "pending" : "active"]
  );
}

export async function PATCH(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "University not found." }, { status: 404 });
  const input = readUniversityInput(body);
  if ("error" in input) return Response.json({ error: input.error }, { status: 400 });
  const logo = body.logo === undefined || body.logo === null ? null : readLogo(body.logo);
  if (logo && "error" in logo) return Response.json({ error: logo.error }, { status: 400 });
  try {
    const { rowCount } = await db.query(
      `UPDATE universities
          SET name = $2, short_name = $3, email_domains = $4,
              logo_data = CASE WHEN $5 THEN $6 ELSE logo_data END,
              logo_type = CASE WHEN $5 THEN $7 ELSE logo_type END,
              logo_path = CASE WHEN $5 THEN NULL ELSE logo_path END,
              updated_at = NOW()
        WHERE id = $1`,
      [id, input.name, input.shortName, input.domains, body.logo !== undefined, logo?.data ?? null, logo?.type ?? null]
    );
    if (!rowCount) return Response.json({ error: "University not found." }, { status: 404 });
    await adoptMatchingAccounts(id, input.domains);
    return Response.json({ ok: true });
  } catch (error) {
    if (isDuplicate(error)) return Response.json({ error: "A university with that name already exists." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "University not found." }, { status: 404 });
  // Its admins lose their admin role: an admin without a university has no one to manage.
  await db.query("UPDATE users SET role = 'employee' WHERE university_id = $1 AND role = 'admin'", [id]);
  const { rowCount } = await db.query("DELETE FROM universities WHERE id = $1", [id]);
  if (!rowCount) return Response.json({ error: "University not found." }, { status: 404 });
  if ((await publicPartnerId()) === id) await setPublicPartnerId(null);
  return Response.json({ ok: true });
}

export async function PUT(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  if (body.publicPartnerId === null) {
    await setPublicPartnerId(null);
    return Response.json({ publicPartnerId: null });
  }
  const id = Number(body.publicPartnerId);
  const exists = Number.isSafeInteger(id) && id > 0 && (await db.query("SELECT 1 FROM universities WHERE id = $1", [id])).rowCount;
  if (!exists) return Response.json({ error: "University not found." }, { status: 404 });
  await setPublicPartnerId(id);
  return Response.json({ publicPartnerId: id });
}
