export const runtime = "nodejs";

import { db } from "@/lib/server/db";
import { notifyUser } from "@/lib/server/notifications";
import { sendJoinApprovedEmail, sendJoinDeclinedEmail } from "@/lib/server/email";
import { requireAccess } from "@/lib/server/access";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import { planPeopleChange, readPeopleAction, type Person } from "@/lib/auth/people-rules";

/**
 * The people an admin manages.
 *   GET   ?university=<id>|none  &filter=pending|tutor-requests  &q=<search>
 *         -> { people }   a university admin always gets their own university
 *   PATCH { userId, action, role?, universityId? }   see src/lib/auth/people-rules.ts
 */
type PersonRow = {
  id: number; name: string | null; email: string; role: string; university_id: number | null;
  university_status: string | null; requested_role: string | null; last_login_at: Date | null; created_at: Date;
  university_name: string | null;
};

const asRole = (role: string) => (role === "admin" || role === "tutor" ? role : "employee") as Person["role"];
const asStatus = (status: string | null) => (status === "active" || status === "pending" ? status : null);

/**
 * Someone waiting to join can't see the app, so approve/decline reaches them by
 * email (plus an in-app note for when they sign in). Best-effort: a mail
 * failure never undoes the decision.
 */
async function tellPersonAboutJoinDecision(row: PersonRow, kind: string): Promise<void> {
  if (row.university_status !== "pending" || (kind !== "approve" && kind !== "remove")) return;
  const university = row.university_name ?? "your university";
  try {
    if (kind === "approve") {
      await notifyUser(row.id, { kind: "join-approved", title: `Welcome to ${university}`, body: "Your request to join was approved.", link: "/app/dashboard/" });
      await sendJoinApprovedEmail(row.email, row.name ?? "", university);
    } else {
      await sendJoinDeclinedEmail(row.email, row.name ?? "", university);
    }
  } catch {
    console.error("Join decision notification failed.");
  }
}

export async function GET(req: Request) {
  const who = await requireAccess("admin");
  if (who instanceof Response) return who;
  const params = new URL(req.url).searchParams;

  const where: string[] = [];
  const values: unknown[] = [];
  if (who.superAdmin) {
    const university = params.get("university");
    if (university === "none") where.push("u.university_id IS NULL");
    else if (university && Number(university) > 0) { values.push(Number(university)); where.push(`u.university_id = $${values.length}`); }
  } else {
    if (!who.universityId) return Response.json({ people: [] });
    values.push(who.universityId);
    where.push(`u.university_id = $${values.length}`);
  }
  const filter = params.get("filter");
  if (filter === "pending") where.push("u.university_status = 'pending'");
  if (filter === "tutor-requests") where.push("u.requested_role = 'tutor' AND u.role = 'employee'");
  const q = (params.get("q") ?? "").trim().slice(0, 80);
  if (q) { values.push(`%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`); where.push(`(u.name ILIKE $${values.length} OR u.email ILIKE $${values.length})`); }

  const { rows } = await db.query<PersonRow>(
    `SELECT u.id, u.name, u.email, u.role, u.university_id, u.university_status, u.requested_role, u.last_login_at, u.created_at,
            un.name AS university_name
       FROM users u LEFT JOIN universities un ON un.id = u.university_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY (u.university_status = 'pending') DESC NULLS LAST, (u.requested_role IS NOT NULL) DESC, lower(coalesce(u.name, u.email))
      LIMIT 500`,
    values
  );
  return Response.json({
    people: rows.map((r) => {
      const superAdmin = isSuperAdminEmail(r.email);
      return {
        id: r.id,
        name: r.name ?? "",
        email: r.email,
        role: superAdmin ? "admin" : asRole(r.role),
        superAdmin,
        universityId: r.university_id,
        universityName: r.university_name,
        status: asStatus(r.university_status),
        requestedRole: r.requested_role,
        lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
        createdAt: new Date(r.created_at).toISOString(),
      };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request) {
  const who = await requireAccess("admin");
  if (who instanceof Response) return who;
  let body: Record<string, unknown>;
  try {
    const raw = await readJsonBody(req, 4 * 1024);
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError || error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const action = readPeopleAction(body);
  if (!action) return Response.json({ error: "Unknown action." }, { status: 400 });
  const userId = Number(body.userId);
  if (!Number.isSafeInteger(userId) || userId < 1) return Response.json({ error: "Person not found." }, { status: 404 });

  const { rows } = await db.query<PersonRow>(
    `SELECT u.id, u.name, u.email, u.role, u.university_id, u.university_status, u.requested_role, un.name AS university_name
       FROM users u LEFT JOIN universities un ON un.id = u.university_id WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return Response.json({ error: "Person not found." }, { status: 404 });
  const person: Person = {
    id: row.id,
    role: asRole(row.role),
    superAdmin: isSuperAdminEmail(row.email),
    universityId: row.university_id,
    status: asStatus(row.university_status),
    requestedRole: row.requested_role,
  };
  if (action.kind === "move" && action.universityId) {
    const exists = await db.query("SELECT 1 FROM universities WHERE id = $1", [action.universityId]);
    if (!exists.rowCount) return Response.json({ error: "University not found." }, { status: 404 });
  }

  const plan = planPeopleChange({ userId: who.userId, superAdmin: who.superAdmin, universityId: who.universityId }, person, action);
  if ("error" in plan) return Response.json({ error: plan.error }, { status: 403 });

  const sets: string[] = [];
  const values: unknown[] = [userId];
  const set = (column: string, value: unknown) => { values.push(value); sets.push(`${column} = $${values.length}`); };
  if (plan.role !== undefined) set("role", plan.role);
  if (plan.universityId !== undefined) set("university_id", plan.universityId);
  if (plan.status !== undefined) set("university_status", plan.status);
  if (plan.requestedRole !== undefined) set("requested_role", plan.requestedRole);
  if (sets.length) await db.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $1`, values);
  await tellPersonAboutJoinDecision(row, action.kind);
  // The change reaches the person's session within a few minutes (see ACCESS_RECHECK_SECONDS).
  return Response.json({ ok: true });
}
