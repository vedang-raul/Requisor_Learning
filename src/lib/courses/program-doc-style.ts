/**
 * How Program Builder documents (the curriculum blueprint and the employer
 * proposal) look when downloaded as PDF or Word: the logos at the top, side by
 * side, and the accent colour. Only those files change; the app itself keeps its own look.
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

/** platformLogo: show the logo the super admin set. customLogos: ones added here, in order, after it. */
export type ProgramDocStyle = { accent: string; platformLogo: boolean; customLogos: string[] };

export const DEFAULT_PROGRAM_DOC_STYLE: ProgramDocStyle = { accent: DOC_THEMES[0].accent, platformLogo: true, customLogos: [] };
/** Largest logo file accepted (it is shrunk, then kept in the browser). */
export const MAX_LOGO_BYTES = 1024 * 1024;
/** Logos on one document, platform logo included: more won't sit side by side legibly. */
export const MAX_DOC_LOGOS = 4;

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
  const accent = isHex(v.accent) ? v.accent.toUpperCase() : DEFAULT_PROGRAM_DOC_STYLE.accent;
  const customLogos = (Array.isArray(v.customLogos) ? v.customLogos.filter(isImageDataUrl) : []).slice(0, MAX_DOC_LOGOS);
  if (Array.isArray(v.customLogos)) {
    const platformLogo = v.platformLogo !== false;
    return { accent, platformLogo, customLogos: customLogos.slice(0, platformLogo ? MAX_DOC_LOGOS - 1 : MAX_DOC_LOGOS) };
  }
  // Saved before several logos: one choice of "default", "custom" or "none".
  if (v.logo === "custom" && isImageDataUrl(v.customLogo)) return { accent, platformLogo: false, customLogos: [v.customLogo] };
  return { accent, platformLogo: v.logo !== "none", customLogos: [] };
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

/** The logos to show, left to right, as image addresses. */
export function logoSources(style: ProgramDocStyle, defaultLogo: string | null): string[] {
  return [...(style.platformLogo && defaultLogo ? [defaultLogo] : []), ...style.customLogos];
}
