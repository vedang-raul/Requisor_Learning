/**
 * Short-lived permission to upload one recording for one tidy-up job.
 *
 * The site may run on a host that can't accept large uploads (Vercel caps
 * request bodies at about 4.5 MB). In that case the recording is sent to a
 * second copy of this app on a host that can (set RECORDING_UPLOAD_URL to its
 * address). That copy is on another domain, so the tutor's login cookie
 * doesn't reach it; this signed token is how it knows the upload is allowed.
 * Both copies must share the same NEXTAUTH_SECRET.
 */

import crypto from "node:crypto";

const TTL_MS = 2 * 60 * 60 * 1000;
const secret = () => process.env.NEXTAUTH_SECRET || process.env.SESSION_SECRET || "";

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(`recording-upload:${payload}`).digest("base64url");

/** The other copy's address, without a trailing slash, or null when uploads go to this app itself. */
export function recordingUploadBase(): string | null {
  const value = (process.env.RECORDING_UPLOAD_URL ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(value) ? value : null;
}

export function createUploadToken(jobId: number, userId: number, now = Date.now()): string {
  const payload = `${jobId}.${userId}.${now + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

/** The user the token was issued to, if it is genuine, unexpired and for this job. */
export function verifyUploadToken(token: unknown, jobId: number, now = Date.now()): number | null {
  if (typeof token !== "string" || !secret()) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [job, user, expires, signature] = parts;
  const expected = sign(`${job}.${user}.${expires}`);
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const userId = Number(user);
  if (Number(job) !== jobId || !Number.isSafeInteger(userId) || userId < 1 || !(Number(expires) > now)) return null;
  return userId;
}
