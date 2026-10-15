export const runtime = "nodejs";

import { currentAccess } from "@/lib/server/access";
import { partnerFor } from "@/lib/server/universities";

/**
 * The partner university to show in the "In association with" spots.
 *   GET -> { partner: { id, name, shortName, logoUrl } | null }
 * A signed-in member sees their own university; everyone else sees the
 * partner super admins chose for the public pages.
 */
export async function GET() {
  const who = await currentAccess();
  const partner = await partnerFor(who && !who.superAdmin ? who.universityId : null);
  return Response.json(
    { partner: partner ? { id: partner.id, name: partner.name, shortName: partner.shortName, logoUrl: partner.logoUrl } : null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
