/**
 * Plain helpers for activity analytics, shared by the server (recording) and
 * the super admin panel (showing). No browser or database APIs.
 */

export type ClientInfo = { browser: string; os: string; device: "mobile" | "tablet" | "desktop" };

/** Browser, operating system and device type from a User-Agent string. Good enough for analytics, not for security. */
export function describeUserAgent(ua: string | null | undefined): ClientInfo {
  const s = ua ?? "";
  const browser =
    /Edg(e|A|iOS)?\//.test(s) ? "Edge"
      : /OPR\/|Opera/.test(s) ? "Opera"
        : /SamsungBrowser\//.test(s) ? "Samsung Internet"
          : /Firefox\/|FxiOS\//.test(s) ? "Firefox"
            : /Chrome\/|CriOS\//.test(s) ? "Chrome"
              : /Safari\//.test(s) && /Version\//.test(s) ? "Safari"
                : s ? "Other" : "Unknown";
  const os =
    /iPhone|iPad|iPod/.test(s) ? "iOS"
      : /Android/.test(s) ? "Android"
        : /CrOS/.test(s) ? "ChromeOS"
          : /Windows/.test(s) ? "Windows"
            : /Mac OS X|Macintosh/.test(s) ? "macOS"
              : /Linux/.test(s) ? "Linux"
                : s ? "Other" : "Unknown";
  const device = /iPad|Tablet/.test(s) || (/Android/.test(s) && !/Mobile/.test(s)) ? "tablet"
    : /Mobi|iPhone|iPod/.test(s) ? "mobile"
      : "desktop";
  return { browser, os, device };
}

/** How someone signed in, from the NextAuth provider id. */
export const LOGIN_METHOD_LABELS: Record<string, string> = {
  credentials: "Email & password",
  google: "Google",
  "dev-student": "Test student shortcut",
  "dev-tutor": "Test tutor shortcut",
  "dev-admin": "Test super admin shortcut",
  "dev-uni-admin": "Test university admin shortcut",
};

export function loginMethodLabel(method: string): string {
  return LOGIN_METHOD_LABELS[method] ?? method;
}

export type PageArea = { area: string; courseSlug: string | null; lessonId: string | null };

/** Which part of the app a path is, plus the course and lesson it shows (from the query). */
export function pageArea(path: string, search = ""): PageArea {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const clean = (v: string | null, max: number) => (v && /^[\w-]+$/.test(v) ? v.slice(0, max) : null);
  const p = path.replace(/\/+$/, "") || "/";
  const under = (prefix: string) => p === prefix || p.startsWith(`${prefix}/`);
  if (under("/app/learn")) return { area: "lesson", courseSlug: clean(params.get("course"), 80), lessonId: clean(params.get("lesson"), 120) };
  if (under("/app/course")) return { area: "course", courseSlug: clean(params.get("slug"), 80), lessonId: null };
  const areas: [string, string][] = [
    ["/app/dashboard", "dashboard"],
    ["/app/my-learning", "my-learning"],
    ["/app/paths", "paths"],
    ["/app/badges", "badges"],
    ["/app/submissions", "submissions"],
    ["/app/settings", "profile"],
    ["/app/tutor", "tutor-workspace"],
    ["/app/admin", "admin"],
  ];
  for (const [prefix, area] of areas) if (under(prefix)) return { area, courseSlug: clean(params.get("course") ?? params.get("slug"), 80), lessonId: null };
  return { area: "other", courseSlug: null, lessonId: null };
}

export const AREA_LABELS: Record<string, string> = {
  lesson: "Lessons",
  course: "Course pages",
  dashboard: "Dashboard",
  "my-learning": "My Learning",
  paths: "Learning paths",
  badges: "Badges",
  submissions: "Submissions",
  profile: "Profile & settings",
  "tutor-workspace": "Tutor workspace",
  admin: "Admin panel",
  other: "Other pages",
};

/** "2h 05m", "14m", "45s". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
