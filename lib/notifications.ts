import { db } from "@/lib/db";

/** Records one server-side notification for a user. Insert-only — callers
 *  decide whether a failure here should block their own request (it
 *  usually shouldn't; see app/api/assignment/submission/route.ts for the
 *  pattern of wrapping this in a try/catch so a notification hiccup never
 *  fails the action that triggered it). */
export async function notifyUser(
  userId: number,
  input: { kind: string; title: string; body: string; link?: string }
): Promise<void> {
  await db.query(
    "INSERT INTO notifications (user_id, kind, title, body, link) VALUES ($1,$2,$3,$4,$5)",
    [userId, input.kind, input.title.slice(0, 200), input.body.slice(0, 2000), input.link?.slice(0, 500) ?? null]
  );
}
