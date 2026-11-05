/**
 * A university's layout for its members, part of its theme (university-theme.ts):
 * which side the sidebar is on, how it looks and whether it starts collapsed;
 * the menu's names, order and hidden items; and what the top bar shows.
 * Display only: hiding a menu item takes it off the menu, it doesn't lock the
 * page (anyone with the link still opens it, as before).
 */
export const NAV_ENTRIES = [
  { key: "dashboard", href: "/app/dashboard/", label: "Dashboard", canHide: false },
  { key: "paths", href: "/app/paths/", label: "Learning Paths", canHide: true },
  { key: "my-learning", href: "/app/my-learning/", label: "My Learning", canHide: true },
  { key: "badges", href: "/app/badges/", label: "Badges", canHide: true },
  { key: "submissions", href: "/app/submissions/", label: "Submissions", canHide: true },
  { key: "tutor", href: "/app/tutor/", label: "Tutor Workspace", canHide: true },
  { key: "program-builder", href: "/app/tutor/program-builder/", label: "Program Builder", canHide: true },
  { key: "check-assignments", href: "/app/tutor/assignment/", label: "Check Assignments", canHide: true },
  { key: "admin", href: "/app/admin/", label: "Admin Panel", canHide: true },
  { key: "profile", href: "/app/settings/", label: "Profile", canHide: true },
] as const;
export type NavKey = (typeof NAV_ENTRIES)[number]["key"];
export type NavSetting = { key: NavKey; label?: string; hidden?: boolean };

export type UniversityLayout = {
  sidebarSide: "left" | "right";
  sidebarStyle: "light" | "tinted" | "dark";
  sidebarStart: "open" | "collapsed";
  /** Every menu entry, in order. */
  nav: NavSetting[];
  topbar: { search: boolean; xp: boolean; mode: boolean; logo: boolean; compact: boolean };
};

export const DEFAULT_LAYOUT: UniversityLayout = {
  sidebarSide: "left",
  sidebarStyle: "light",
  sidebarStart: "open",
  nav: NAV_ENTRIES.map((e) => ({ key: e.key })),
  topbar: { search: true, xp: true, mode: true, logo: false, compact: false },
};

export const MAX_NAV_LABEL = 28;
const label = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAV_LABEL) : "");

/** A stored or submitted layout, cleaned: unknown entries dropped, missing ones added at the end. Null when it isn't one. */
export function readLayout(raw: unknown): UniversityLayout | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (options.includes(value as T) ? (value as T) : fallback);
  const seen = new Set<string>();
  const nav: NavSetting[] = [];
  for (const item of Array.isArray(v.nav) ? v.nav : []) {
    const n = (item ?? {}) as Record<string, unknown>;
    const entry = NAV_ENTRIES.find((e) => e.key === n.key);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    const name = label(n.label);
    nav.push({ key: entry.key, ...(name && name !== entry.label ? { label: name } : {}), ...(n.hidden === true && entry.canHide ? { hidden: true } : {}) });
  }
  for (const entry of NAV_ENTRIES) if (!seen.has(entry.key)) nav.push({ key: entry.key });
  const t = (v.topbar && typeof v.topbar === "object" ? v.topbar : {}) as Record<string, unknown>;
  const flag = (key: keyof UniversityLayout["topbar"]) => (typeof t[key] === "boolean" ? (t[key] as boolean) : DEFAULT_LAYOUT.topbar[key]);
  return {
    sidebarSide: pick(v.sidebarSide, ["left", "right"] as const, "left"),
    sidebarStyle: pick(v.sidebarStyle, ["light", "tinted", "dark"] as const, "light"),
    sidebarStart: pick(v.sidebarStart, ["open", "collapsed"] as const, "open"),
    nav,
    topbar: { search: flag("search"), xp: flag("xp"), mode: flag("mode"), logo: flag("logo"), compact: flag("compact") },
  };
}

/**
 * A menu in the university's order and words, without the hidden entries.
 * `items` are what this person may see (already filtered by role); each is
 * matched to its entry by its address. Items without an entry keep their place at the end.
 */
export function arrangeNav<T extends { href: string; label: string }>(items: T[], layout: UniversityLayout): T[] {
  const keyOf = (href: string) => NAV_ENTRIES.find((e) => e.href === href)?.key;
  const position = new Map(layout.nav.map((n, i) => [n.key, i]));
  const setting = new Map(layout.nav.map((n) => [n.key, n]));
  return items
    .filter((item) => { const k = keyOf(item.href); return !(k && setting.get(k)?.hidden); })
    .map((item) => { const k = keyOf(item.href); const name = k ? setting.get(k)?.label : undefined; return name ? { ...item, label: name } : item; })
    .sort((a, b) => (position.get(keyOf(a.href)!) ?? 999) - (position.get(keyOf(b.href)!) ?? 999));
}

/** An entry's name in this layout (the university's, or the default). */
export const navName = (layout: UniversityLayout, key: NavKey) =>
  layout.nav.find((n) => n.key === key)?.label ?? NAV_ENTRIES.find((e) => e.key === key)!.label;
export const navHidden = (layout: UniversityLayout, key: NavKey) => Boolean(layout.nav.find((n) => n.key === key)?.hidden);
