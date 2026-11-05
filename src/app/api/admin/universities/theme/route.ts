export const runtime = "nodejs";

import { requireAccess } from "@/lib/server/access";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";
import { hasUniversityFont, setUniversityTheme } from "@/lib/server/universities";
import { readTheme } from "@/lib/theme/university-theme";

/**
 * A university's theme, for super admins.
 *   PUT { id, theme }        save it: { primary, secondary, background, sidebar } as #RRGGBB, and a font key
 *                            ("custom" for the font uploaded through ./font)
 *   PUT { id, theme: null }  back to Requisor's own look
 * Its members see the change on the next page they open.
 */
export async function PUT(req: Request) {
  const who = await requireAccess("super");
  if (who instanceof Response) return who;
  let body: Record<string, unknown>;
  try {
    const raw = await readJsonBody(req, 4_096);
    body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError || error instanceof InvalidJsonBodyError) return Response.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "University not found." }, { status: 404 });
  const theme = body.theme === null ? null : readTheme(body.theme);
  if (body.theme !== null && !theme) return Response.json({ error: "Choose a colour for each part (#RRGGBB) and a font from the list." }, { status: 400 });
  if (theme?.font === "custom" && !(await hasUniversityFont(id))) return Response.json({ error: "Upload the font first." }, { status: 400 });
  if (!(await setUniversityTheme(id, theme))) return Response.json({ error: "University not found." }, { status: 404 });
  return Response.json({ theme });
}
