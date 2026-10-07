/**
 * Job titles (the profile's "position"). Letters only, in any language, with
 * spaces and the few marks real titles use: "Software Engineer",
 * "Vice-President, R&D", "Élève infirmière". No digits and no other symbols.
 *
 * The same rule runs in the browser (to guide typing) and on the server (which
 * is what actually enforces it). Database queries are parameterised throughout
 * the app, so this is about keeping the data clean, not the only thing
 * standing between a text box and the database.
 */

export const JOB_TITLE_MAX_LENGTH = 80;
export const JOB_TITLE_HINT = "Letters only, e.g. Student or Software Engineer.";

const ALLOWED = /^[\p{L}\p{M}][\p{L}\p{M} .,'’&/()\-–—]*$/u;
const DISALLOWED_CHARS = /[^\p{L}\p{M} .,'’&/()\-–—]/gu;
/** Two marks in a row ("--", "')") never appear in a real title. */
const DOUBLED_MARKS = /[.,'’&/()\-–—]{2,}/u;

/** Drops anything a job title can't contain. For tidying input as it is typed. */
export function stripJobTitle(value: string): string {
  return value.replace(DISALLOWED_CHARS, "").replace(/\s{2,}/g, " ").slice(0, JOB_TITLE_MAX_LENGTH);
}

/**
 * Checks a submitted job title. Empty is allowed (ok, with value ""): whether
 * the field is required is the caller's decision.
 */
export function checkJobTitle(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, error: "Enter a valid job title." };
  const title = value.trim().replace(/\s{2,}/g, " ");
  if (!title) return { ok: true, value: "" };
  if (title.length > JOB_TITLE_MAX_LENGTH) return { ok: false, error: `Job title can be up to ${JOB_TITLE_MAX_LENGTH} characters.` };
  const letters = title.match(/\p{L}/gu)?.length ?? 0;
  if (!ALLOWED.test(title) || DOUBLED_MARKS.test(title) || letters < 2) return { ok: false, error: "Job title can only contain letters, for example Student or Software Engineer." };
  return { ok: true, value: title };
}
