export const runtime = "nodejs";

import { db } from "@/lib/server/db";

/**
 * A university's uploaded logo.
 *   GET /api/universities/<id>/logo/?v=<version>
 * The version in the link changes when the logo does, so it can be cached for long.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return new Response("Not found", { status: 404 });
  const { rows } = await db.query<{ logo_data: Buffer | null; logo_type: string | null }>(
    "SELECT logo_data, logo_type FROM universities WHERE id = $1",
    [id]
  );
  const logo = rows[0];
  if (!logo?.logo_data || !logo.logo_type) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.logo_data), {
    headers: {
      "Content-Type": logo.logo_type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
