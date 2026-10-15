import {
  BarChart3, BookOpen, Bot, Briefcase, Code2, FlaskConical, Globe, GraduationCap, HeartPulse, Landmark, Languages, Layers, Leaf,
  Lightbulb, LucideIcon, Megaphone, Package, Palette, Rocket, Shield, Terminal, Users, Wrench,
} from "lucide-react";

/**
 * Category theming — the single source of truth for icon/label/gradient per
 * course category. Category is a free-form string now (a tutor can add any
 * new one from the course editor's category field), so every lookup here
 * has a safe fallback instead of assuming one of a fixed set of keys.
 */

export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  tint: string;
}

/**
 * The icons a tutor can give a course. A course stores its choice in its
 * `category` field (the key below), which is also where its colour comes from.
 * The first four are the ones this platform launched with; their keys and
 * colours are unchanged, so existing courses look the same.
 */
export const COURSE_ICONS: { key: string; name: string; icon: LucideIcon; cover: string }[] = [
  { key: "product", name: "Box", icon: Package, cover: "from-indigo-500 via-violet-500 to-fuchsia-500" },
  { key: "data", name: "Chart", icon: BarChart3, cover: "from-cyan-500 via-sky-500 to-blue-600" },
  { key: "ai", name: "Robot", icon: Bot, cover: "from-violet-500 via-purple-500 to-indigo-600" },
  { key: "security", name: "Shield", icon: Shield, cover: "from-emerald-500 via-teal-500 to-cyan-600" },
  { key: "code", name: "Code", icon: Code2, cover: "from-slate-600 via-slate-700 to-zinc-800" },
  { key: "programming", name: "Programming", icon: Terminal, cover: "from-sky-600 via-blue-600 to-indigo-700" },
  { key: "design", name: "Palette", icon: Palette, cover: "from-rose-500 via-pink-500 to-fuchsia-600" },
  { key: "business", name: "Briefcase", icon: Briefcase, cover: "from-amber-500 via-orange-500 to-red-600" },
  { key: "marketing", name: "Megaphone", icon: Megaphone, cover: "from-orange-500 via-rose-500 to-pink-600" },
  { key: "finance", name: "Bank", icon: Landmark, cover: "from-teal-500 via-emerald-500 to-green-600" },
  { key: "health", name: "Heart", icon: HeartPulse, cover: "from-red-500 via-rose-500 to-pink-600" },
  { key: "science", name: "Flask", icon: FlaskConical, cover: "from-sky-500 via-blue-500 to-indigo-600" },
  { key: "language", name: "Languages", icon: Languages, cover: "from-purple-500 via-fuchsia-500 to-pink-600" },
  { key: "people", name: "People", icon: Users, cover: "from-blue-500 via-indigo-500 to-violet-600" },
  { key: "idea", name: "Lightbulb", icon: Lightbulb, cover: "from-yellow-500 via-amber-500 to-orange-600" },
  { key: "launch", name: "Rocket", icon: Rocket, cover: "from-fuchsia-500 via-purple-500 to-indigo-600" },
  { key: "tools", name: "Wrench", icon: Wrench, cover: "from-zinc-500 via-slate-600 to-slate-700" },
  { key: "nature", name: "Leaf", icon: Leaf, cover: "from-lime-500 via-green-500 to-emerald-600" },
  { key: "world", name: "Globe", icon: Globe, cover: "from-teal-500 via-cyan-500 to-sky-600" },
  { key: "study", name: "Graduation cap", icon: GraduationCap, cover: "from-indigo-500 via-blue-500 to-cyan-600" },
  { key: "reading", name: "Book", icon: BookOpen, cover: "from-stone-500 via-amber-700 to-orange-800" },
];
export const DEFAULT_COURSE_ICON = "study";
const ICON_BY_KEY = new Map(COURSE_ICONS.map((entry) => [entry.key, entry]));

/** The four this platform launched with, kept for anything that still lists them. */
export const DEFAULT_CATEGORIES = ["product", "data", "ai", "security"];

const KNOWN_COVERS: Record<string, string> = Object.fromEntries(COURSE_ICONS.map((entry) => [entry.key, entry.cover]));

/** Cover gradients offered to a category not in KNOWN_COVERS — picked
 *  deterministically from the category name so the same new category
 *  always renders the same color instead of a random one per render. */
const FALLBACK_COVER_PALETTE = [
  "from-rose-500 via-pink-500 to-fuchsia-600",
  "from-amber-500 via-orange-500 to-red-600",
  "from-lime-500 via-green-500 to-emerald-600",
  "from-sky-500 via-blue-500 to-indigo-600",
  "from-purple-500 via-fuchsia-500 to-pink-600",
  "from-teal-500 via-cyan-500 to-sky-600",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

/** Known categories get their exact existing icon/label/tint; any other
 *  string (a tutor-added category) falls back to a generic icon, using the
 *  category text itself as the label. */
export function getCategoryMeta(category: string): CategoryMeta {
  const known = ICON_BY_KEY.get(category);
  return known ? { label: known.name, icon: known.icon, tint: "text-emerald-400" } : { label: category, icon: Layers, tint: "text-emerald-400" };
}

/** Whether a stored category is one of the icons on offer (older courses may hold free text). */
export function isCourseIcon(category: string): boolean {
  return ICON_BY_KEY.has(category);
}

/** Known categories keep their exact gradient; anything else gets a
 *  deterministic pick from a small fallback palette. */
export function getCategoryCover(category: string): string {
  return KNOWN_COVERS[category] ?? FALLBACK_COVER_PALETTE[hashString(category) % FALLBACK_COVER_PALETTE.length];
}
