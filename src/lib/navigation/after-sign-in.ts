/**
 * Where to go after signing in, when someone arrived signed out at a page in
 * the app (for example a course's share link). Remembered in this browser tab
 * for a short while and used once.
 *
 * Only a path inside the app ("/app/…") is ever accepted, so this can never
 * send anyone to another site (no "//host", schemes, backslashes or encoded
 * tricks). It grants no access: the page itself still decides who may see it.
 */
const KEY = "requisor-after-sign-in";
const MAX_AGE_MS = 30 * 60_000;

/** The same path when it is a safe in-app destination, else null. */
export function safeAppPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500 || !raw.startsWith("/app/")) return null;
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw, "https://alma.invalid");
    if (url.origin !== "https://alma.invalid" || !url.pathname.startsWith("/app/")) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

export function rememberAfterSignIn(path: string): void {
  const safe = safeAppPath(path);
  if (!safe) return;
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ path: safe, at: Date.now() })); } catch { /* storage blocked: sign-in goes to the dashboard */ }
}

/** The remembered destination, if any and still fresh; it is cleared either way. */
export function takeAfterSignIn(now = Date.now()): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof saved.at !== "number" || now - saved.at > MAX_AGE_MS || saved.at > now + 60_000) return null;
    return safeAppPath(saved.path);
  } catch {
    return null;
  }
}

/** Looks without clearing (for Google sign-in, which leaves the page and comes back). */
export function peekAfterSignIn(now = Date.now()): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { path?: unknown; at?: unknown };
    if (typeof saved.at !== "number" || now - saved.at > MAX_AGE_MS) return null;
    return safeAppPath(saved.path);
  } catch {
    return null;
  }
}
