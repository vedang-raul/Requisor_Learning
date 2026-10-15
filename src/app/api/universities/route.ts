export const runtime = "nodejs";

import { listUniversities } from "@/lib/server/universities";

/**
 * The universities people can join, for the sign-up form.
 *   GET -> { universities: [{ id, name, shortName, domains, logoUrl }] }
 * Public: the list is what any visitor sees in the sign-up dropdown.
 */
export async function GET() {
  const universities = await listUniversities();
  return Response.json({ universities }, { headers: { "Cache-Control": "public, max-age=60" } });
}
