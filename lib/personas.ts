/**
 * The on-screen AI guide's selectable personas.
 *
 * Deliberately NOT tied to any user demographic field (race, gender,
 * ethnicity) — each is a purely aesthetic "skin" the user picks for
 * themselves, the same way a game avatar or Bitmoji style is picked. The
 * portrait itself is an illustrated human character (DiceBear's "avataaars"
 * style, MIT-licensed) — see getPersonaAvatarUrl / PersonaAvatar for the
 * rendering. Every field below (hairstyle, hair color, skin tone, clothing,
 * expression) is a fixed, hand-picked combination baked into this file, not
 * derived from anything about the viewing user.
 */
export interface Persona {
  id: string;
  name: string;
  tagline: string;
  /** Hex pair — [0] is the avatar's background tile, also used for the glow ring. */
  accentHex: [string, string];
  /** DiceBear "avataaars" query params for this persona's specific look. */
  avatarParams: Record<string, string>;
}

export const PERSONAS: Persona[] = [
  {
    id: "nova", name: "Nova", tagline: "Calm and encouraging", accentHex: ["#23AE97", "#1C9583"],
    avatarParams: { skinColor: "d08b5b", top: "straight01", hairColor: "2c1b18", clothing: "blazerAndShirt", eyes: "happy", mouth: "smile", eyebrows: "defaultNatural" },
  },
  {
    id: "zephyr", name: "Zephyr", tagline: "Energetic and direct", accentHex: ["#06B6D4", "#2563EB"],
    avatarParams: { skinColor: "edb98a", top: "shortFlat", hairColor: "d6b370", clothing: "hoodie", eyes: "default", mouth: "default", eyebrows: "defaultNatural" },
  },
  {
    id: "iris", name: "Iris", tagline: "Thoughtful and precise", accentHex: ["#C026D3", "#7C3AED"],
    avatarParams: { skinColor: "ffdbb4", top: "curly", hairColor: "724133", clothing: "blazerAndSweater", eyes: "happy", mouth: "twinkle", eyebrows: "raisedExcitedNatural" },
  },
  {
    id: "milo", name: "Milo", tagline: "Friendly and upbeat", accentHex: ["#F59E0B", "#EA580C"],
    avatarParams: { skinColor: "ae5d29", top: "shortCurly", hairColor: "a55728", clothing: "shirtCrewNeck", eyes: "default", mouth: "smile", eyebrows: "defaultNatural" },
  },
  {
    id: "sage", name: "Sage", tagline: "Steady and reassuring", accentHex: ["#10B981", "#0D9488"],
    avatarParams: { skinColor: "614335", top: "shortRound", hairColor: "ecdcbf", clothing: "collarAndSweater", eyes: "default", mouth: "serious", eyebrows: "defaultNatural", facialHairProbability: "100", facialHair: "beardLight", facialHairColor: "ecdcbf" },
  },
  {
    id: "echo", name: "Echo", tagline: "Curious and sharp", accentHex: ["#6366F1", "#7C3AED"],
    avatarParams: { skinColor: "d08b5b", top: "bob", hairColor: "2c1b18", clothing: "shirtVNeck", eyes: "default", mouth: "twinkle", eyebrows: "defaultNatural" },
  },
];

export const DEFAULT_PERSONA_ID = PERSONAS[0].id;

export function getPersona(id: string | null | undefined): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

const DICEBEAR_AVATAR_URL = "https://api.dicebear.com/9.x/avataaars/svg";

/**
 * Builds the illustrated-portrait URL for a persona. Centralized here so the
 * illustration provider (currently DiceBear's public API) is swappable in
 * one place — e.g. moving to the self-hosted @dicebear/core package to drop
 * the runtime dependency on api.dicebear.com — without touching every
 * component that renders a persona.
 */
export function getPersonaAvatarUrl(persona: Persona, sizePx?: number): string {
  const params = new URLSearchParams({
    seed: persona.id,
    backgroundType: "solid",
    backgroundColor: persona.accentHex[0].replace("#", ""),
    accessoriesProbability: "0",
    facialHairProbability: "0",
    radius: "0",
    ...persona.avatarParams,
  });
  if (sizePx) params.set("size", String(Math.round(sizePx)));
  return `${DICEBEAR_AVATAR_URL}?${params.toString()}`;
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
