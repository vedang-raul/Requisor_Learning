import { Bot, BarChart3, Package, Shield, Layers, LucideIcon } from "lucide-react";

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

/** The four categories this platform launched with — kept for their exact
 *  existing icon/label/color so already-created courses don't change look. */
const KNOWN_CATEGORY_META: Record<string, CategoryMeta> = {
  product: { label: "Product Management", icon: Package, tint: "text-emerald-400" },
  data: { label: "Data Analytics", icon: BarChart3, tint: "text-emerald-400" },
  ai: { label: "Agentic AI", icon: Bot, tint: "text-emerald-400" },
  security: { label: "Cyber Security", icon: Shield, tint: "text-emerald-400" },
};

/** The four categories every install ships with — offered as suggestions in
 *  the course editor's category field, alongside whatever else is in use. */
export const DEFAULT_CATEGORIES = ["product", "data", "ai", "security"];

const KNOWN_COVERS: Record<string, string> = {
  product: "from-indigo-500 via-violet-500 to-fuchsia-500",
  data: "from-cyan-500 via-sky-500 to-blue-600",
  ai: "from-violet-500 via-purple-500 to-indigo-600",
  security: "from-emerald-500 via-teal-500 to-cyan-600",
};

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
  return KNOWN_CATEGORY_META[category] ?? { label: category, icon: Layers, tint: "text-emerald-400" };
}

/** Known categories keep their exact gradient; anything else gets a
 *  deterministic pick from a small fallback palette. */
export function getCategoryCover(category: string): string {
  return KNOWN_COVERS[category] ?? FALLBACK_COVER_PALETTE[hashString(category) % FALLBACK_COVER_PALETTE.length];
}
