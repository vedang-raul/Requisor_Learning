/**
 * How Program Builder documents (the curriculum blueprint and the employer
 * proposal) look when downloaded as PDF or Word: the logo at the top and the
 * accent colour. Only those files change; the app itself keeps its own look.
 * Remembered in this browser for each account.
 */
export const DOC_THEMES = [
  { key: "teal", label: "Teal", accent: "#0F766E" },
  { key: "navy", label: "Navy", accent: "#1E3A8A" },
  { key: "burgundy", label: "Burgundy", accent: "#9F1239" },
  { key: "forest", label: "Forest", accent: "#166534" },
  { key: "plum", label: "Plum", accent: "#6D28D9" },
  { key: "charcoal", label: "Charcoal", accent: "#334155" },
] as const;

/** "default": the platform logo the super admin set; "custom": one uploaded here; "none": no logo. */
export type LogoChoice = "default" | "custom" | "none";
export type ProgramDocStyle = { accent: string; logo: LogoChoice; customLogo?: string };

export const DEFAULT_PROGRAM_DOC_STYLE: ProgramDocStyle = { accent: DOC_THEMES[0].accent, logo: "default" };
/** Largest logo accepted (it is kept in the browser). */
export const MAX_LOGO_BYTES = 1024 * 1024;

const KEY = "requisor-program-doc-style";
const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const isImageDataUrl = (value: unknown): value is string =>
  typeof value === "string" && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(value) && value.length <= MAX_LOGO_BYTES * 1.4 + 100;

export function docStyleKey(owner: string): string | null {
  const account = owner.trim().toLowerCase();
  return account ? `${KEY}:${encodeURIComponent(account)}` : null;
}

/** A saved style, cleaned; anything unusable falls back to the default. */
export function readDocStyle(raw: unknown): ProgramDocStyle {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const customLogo = isImageDataUrl(v.customLogo) ? v.customLogo : undefined;
  const logo: LogoChoice = v.logo === "none" ? "none" : v.logo === "custom" && customLogo ? "custom" : "default";
  return { accent: isHex(v.accent) ? v.accent.toUpperCase() : DEFAULT_PROGRAM_DOC_STYLE.accent, logo, ...(customLogo ? { customLogo } : {}) };
}

export function loadDocStyle(owner: string): ProgramDocStyle {
  const key = docStyleKey(owner);
  if (!key) return DEFAULT_PROGRAM_DOC_STYLE;
  try { return readDocStyle(JSON.parse(window.localStorage.getItem(key) ?? "null")); } catch { return DEFAULT_PROGRAM_DOC_STYLE; }
}

export function saveDocStyle(owner: string, style: ProgramDocStyle): void {
  const key = docStyleKey(owner);
  if (!key) return;
  try { window.localStorage.setItem(key, JSON.stringify(style)); } catch { /* storage full or blocked: the style lasts until reload */ }
}

/** The logo to show, as an image address, or null for none. */
export function logoSource(style: ProgramDocStyle, defaultLogo: string | null): string | null {
  if (style.logo === "none") return null;
  if (style.logo === "custom" && style.customLogo) return style.customLogo;
  return defaultLogo;
}
