import { cleanDomains } from "../auth/roles";

/**
 * Checks what a super admin sends to add or change a university. Kept apart
 * from the route so it can be tested on its own.
 */
export const MAX_LOGO_BYTES = 512 * 1024;

/** The image types a logo may be. SVG is left out: it can carry scripts. */
const LOGO_TYPES: Record<string, (bytes: Buffer) => boolean> = {
  "image/png": (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

export type LogoUpload = { type: string; data: Buffer };

/** Reads a logo sent as a data URL ("data:image/png;base64,..."). Returns an error message when it can't be used. */
export function readLogo(raw: unknown): LogoUpload | { error: string } {
  if (typeof raw !== "string") return { error: "The logo must be an image file." };
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(raw);
  if (!match) return { error: "The logo must be a PNG, JPEG or WebP image." };
  const type = match[1];
  const check = LOGO_TYPES[type];
  if (!check) return { error: "The logo must be a PNG, JPEG or WebP image." };
  const data = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (data.length > MAX_LOGO_BYTES) return { error: "The logo is too large. Keep it under 512 KB." };
  if (!check(data)) return { error: "That file isn't the image it claims to be." };
  return { type, data };
}

const tidy = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export type UniversityInput = { name: string; shortName: string; domains: string[] };

/** The name, short name and email domains of a university, cleaned. */
export function readUniversityInput(body: Record<string, unknown>): UniversityInput | { error: string } {
  const name = tidy(body.name, 120);
  if (name.length < 3) return { error: "Enter the university's full name." };
  const shortName = tidy(body.shortName, 40);
  return { name, shortName, domains: cleanDomains(body.domains) };
}
