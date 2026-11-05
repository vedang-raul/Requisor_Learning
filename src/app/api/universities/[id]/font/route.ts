export const runtime = "nodejs";

import { universityFontFile } from "@/lib/server/universities";

/**
 * A university's uploaded font, for its theme.
 *   GET /api/universities/<id>/font/?v=<version>
 * The version in the link changes when the font does, so it can be cached for long.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const font = await universityFontFile(Number((await params).id));
  if (!font) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(font.data), {
    headers: {
      "Content-Type": font.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
