/**
 * The on-screen AI guide's selectable personas.
 *
 * Deliberately NOT tied to any user demographic field (race, gender,
 * ethnicity) — each is a purely aesthetic "skin" the user picks for
 * themselves, the same way a game avatar or Bitmoji style is picked. See
 * PersonaAvatar for the actual rendering.
 */
export interface Persona {
  id: string;
  name: string;
  tagline: string;
  /** Tailwind gradient stop classes, e.g. "from-primary to-secondary". */
  accent: string;
  /** Hex pair used inside the inline SVG gradient (can't reference Tailwind tokens there). */
  accentHex: [string, string];
  /** Silhouette variant rendered by PersonaAvatar — purely a shape choice. */
  variant: "wave" | "coil" | "spike" | "halo" | "fin" | "orbit";
}

export const PERSONAS: Persona[] = [
  { id: "nova", name: "Nova", tagline: "Calm and encouraging", accent: "from-primary to-secondary", accentHex: ["#23AE97", "#1C9583"], variant: "wave" },
  { id: "zephyr", name: "Zephyr", tagline: "Energetic and direct", accent: "from-cyan-500 to-blue-600", accentHex: ["#06B6D4", "#2563EB"], variant: "spike" },
  { id: "iris", name: "Iris", tagline: "Thoughtful and precise", accent: "from-fuchsia-600 to-purple-600", accentHex: ["#C026D3", "#7C3AED"], variant: "coil" },
  { id: "milo", name: "Milo", tagline: "Friendly and upbeat", accent: "from-amber-500 to-orange-600", accentHex: ["#F59E0B", "#EA580C"], variant: "halo" },
  { id: "sage", name: "Sage", tagline: "Steady and reassuring", accent: "from-emerald-500 to-teal-600", accentHex: ["#10B981", "#0D9488"], variant: "fin" },
  { id: "echo", name: "Echo", tagline: "Curious and sharp", accent: "from-indigo-500 to-violet-600", accentHex: ["#6366F1", "#7C3AED"], variant: "orbit" },
];

export const DEFAULT_PERSONA_ID = PERSONAS[0].id;

export function getPersona(id: string | null | undefined): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

/** Curated set — every option a genuine live language on the platform, not a locale/country proxy. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "ru", label: "Русский" },
  { code: "pl", label: "Polski" },
  { code: "id", label: "Bahasa Indonesia" },
];

export function getLanguageLabel(code: string | null | undefined): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? "English";
}

/** Countries drive locale/timezone-flavored small talk only — never appearance. */
export const COUNTRIES: string[] = [
  "United States", "United Kingdom", "Canada", "Australia", "India", "Germany",
  "France", "Spain", "Italy", "Netherlands", "Brazil", "Mexico", "Japan",
  "South Korea", "China", "Singapore", "United Arab Emirates", "South Africa",
  "Nigeria", "Kenya", "Egypt", "Saudi Arabia", "Indonesia", "Philippines",
  "Poland", "Sweden", "Ireland", "New Zealand", "Pakistan", "Bangladesh",
];
