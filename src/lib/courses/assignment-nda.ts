import { createHash } from "node:crypto";
import { db } from "@/lib/server/db";
import { ASSIGNMENT_NDA_TABLES } from "@/lib/server/feature-tables";
import { readAssignmentBrand } from "@/lib/courses/assignment-brand";

/**
 * NDA signatures for branded assignments (see assignment-brand.ts). A signature
 * is for the exact text the learner saw: it is stored with the text and its
 * hash, so if the tutor changes the agreement, learners sign the new one.
 */
let tables: Promise<unknown> | null = null;
const ensureTables = () => (tables ??= db.query(ASSIGNMENT_NDA_TABLES).catch((error) => { tables = null; throw error; }));

export const ndaHash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** The lesson's agreement and brief, when it is a branded assignment with an NDA; null otherwise. */
export async function lessonNda(lessonId: string): Promise<{ text: string; brandName: string; brief: string | null } | null> {
  const { rows } = await db.query<{ assignment_brand: unknown; assignment: string | null }>(
    "SELECT assignment_brand, assignment FROM course_lessons WHERE id = $1", [lessonId]);
  const brand = readAssignmentBrand(rows[0]?.assignment_brand);
  return brand?.nda ? { text: brand.nda.text, brandName: brand.name, brief: rows[0].assignment } : null;
}

export async function signatureFor(userId: number, lessonId: string, text: string): Promise<{ signedName: string; signedAt: string } | null> {
  await ensureTables();
  const { rows } = await db.query<{ signed_name: string; signed_at: Date }>(
    "SELECT signed_name, signed_at FROM assignment_nda_signatures WHERE user_id = $1 AND lesson_id = $2 AND nda_hash = $3",
    [userId, lessonId, ndaHash(text)]);
  return rows[0] ? { signedName: rows[0].signed_name, signedAt: new Date(rows[0].signed_at).toISOString() } : null;
}

/** Records the learner's signature of this exact text. Signing again keeps the first signature. */
export async function signNda(userId: number, lessonId: string, text: string, signedName: string): Promise<{ signedName: string; signedAt: string }> {
  await ensureTables();
  await db.query(
    `INSERT INTO assignment_nda_signatures (user_id, lesson_id, nda_hash, nda_text, signed_name) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, lesson_id, nda_hash) DO NOTHING`,
    [userId, lessonId, ndaHash(text), text, signedName]);
  return (await signatureFor(userId, lessonId, text))!;
}

/** True when this learner must still sign the lesson's NDA before seeing the brief or handing in. */
export async function ndaBlocks(userId: number, lessonId: string): Promise<boolean> {
  const nda = await lessonNda(lessonId);
  return nda ? !(await signatureFor(userId, lessonId, nda.text)) : false;
}

export type NdaSignature = { name: string | null; email: string; signedName: string; signedAt: string; current: boolean };

/** Everyone who signed the lesson's NDA, newest first; `current` is false for an earlier version of the text. */
export async function ndaSignatures(lessonId: string): Promise<NdaSignature[]> {
  await ensureTables();
  const nda = await lessonNda(lessonId);
  const { rows } = await db.query<{ name: string | null; email: string; signed_name: string; signed_at: Date; nda_hash: string }>(
    `SELECT u.name, u.email, s.signed_name, s.signed_at, s.nda_hash
       FROM assignment_nda_signatures s JOIN users u ON u.id = s.user_id
      WHERE s.lesson_id = $1 ORDER BY s.signed_at DESC LIMIT 500`, [lessonId]);
  const current = nda ? ndaHash(nda.text) : null;
  return rows.map((r) => ({ name: r.name, email: r.email, signedName: r.signed_name, signedAt: new Date(r.signed_at).toISOString(), current: r.nda_hash === current }));
}
