export const runtime = "nodejs";

import { requireAccess } from "@/lib/server/access";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { setUniversityFont } from "@/lib/server/universities";
import { MAX_FONT_BYTES, readFontUpload } from "@/lib/theme/font-upload";

/**
 * A university's own font, for super admins.
 *   PUT    { id, file: { name, data } }  upload it (a data: URL of a WOFF2, WOFF, TTF or OTF file); replaces any earlier one
 *   DELETE { id }                        remove it; a theme using it goes back to Requisor's font
 * The theme uses it once its font is set to "custom" (see ./theme).
 */
async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const raw = await readJsonBody(req, Math.ceil(MAX_FONT_BYTES * 1.4) + 4_096);
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return Response.json({ error: "That font file is too large. Keep it under 1.5 MB." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
}

const readId = (body: Record<string, unknown>) => { const id = Number(body.id); return Number.isSafeInteger(id) && id > 0 ? id : null; };

export async function PUT(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const id = readId(body);
  if (!id) return Response.json({ error: "University not found." }, { status: 404 });
  const font = readFontUpload(body.file);
  if ("error" in font) return Response.json({ error: font.error }, { status: 400 });
  if (!(await setUniversityFont(id, font))) return Response.json({ error: "University not found." }, { status: 404 });
  return Response.json({ font: { name: font.name } });
}

export async function DELETE(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const id = readId(body);
  if (!id || !(await setUniversityFont(id, null))) return Response.json({ error: "University not found." }, { status: 404 });
  return Response.json({ ok: true });
}
