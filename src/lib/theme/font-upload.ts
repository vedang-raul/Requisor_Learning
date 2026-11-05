/**
 * A font a super admin uploads for a university's theme. Only real web font
 * files are kept (checked by their first bytes, not by the name or the type the
 * browser claims), and the file is served from this site, so no other site is
 * involved. Its name is only ever shown, never written into CSS.
 */
export const MAX_FONT_BYTES = 1_500_000;

export const FONT_FORMATS = {
  woff2: { mime: "font/woff2", css: "woff2", magic: [0x77, 0x4f, 0x46, 0x32] },      // "wOF2"
  woff: { mime: "font/woff", css: "woff", magic: [0x77, 0x4f, 0x46, 0x46] },         // "wOFF"
  ttf: { mime: "font/ttf", css: "truetype", magic: [0x00, 0x01, 0x00, 0x00] },
  otf: { mime: "font/otf", css: "opentype", magic: [0x4f, 0x54, 0x54, 0x4f] },        // "OTTO"
} as const;
export type FontFormat = keyof typeof FONT_FORMATS;

export type FontUpload = { name: string; format: FontFormat; data: Buffer };

/** What kind of font file these bytes are, if any. */
export function sniffFont(data: Uint8Array): FontFormat | null {
  for (const [format, spec] of Object.entries(FONT_FORMATS) as [FontFormat, (typeof FONT_FORMATS)[FontFormat]][]) {
    if (spec.magic.every((byte, i) => data[i] === byte)) return format;
  }
  // Some TrueType files start with "true" instead.
  if (data[0] === 0x74 && data[1] === 0x72 && data[2] === 0x75 && data[3] === 0x65) return "ttf";
  return null;
}

/** The uploaded file ({ name, data: a data: URL }) as a font we can keep, or why not. */
export function readFontUpload(raw: unknown): FontUpload | { error: string } {
  const v = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const match = typeof v.data === "string" ? /^data:[^;,]*;base64,([A-Za-z0-9+/=\s]+)$/.exec(v.data) : null;
  if (!match) return { error: "Choose a font file: WOFF2, WOFF, TTF or OTF." };
  const data = Buffer.from(match[1].replace(/\s+/g, ""), "base64");
  if (!data.length) return { error: "That font file is empty." };
  if (data.length > MAX_FONT_BYTES) return { error: "That font file is too large. Keep it under 1.5 MB (WOFF2 files are the smallest)." };
  const format = sniffFont(data);
  if (!format) return { error: "That file isn't a font. Use WOFF2, WOFF, TTF or OTF." };
  const name = typeof v.name === "string" ? v.name.replace(/[^\p{L}\p{N} ._()-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80) : "";
  return { name: name || `Font.${format}`, format, data };
}
