import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { sanitizeAccessibilityPrefs } from "@/lib/accessibility/preferences";
import { InvalidJsonBodyError, readJsonBody, RequestBodyTooLargeError } from "@/lib/server/request-body";

/** The signed-in person's accessibility preferences (see src/lib/accessibility/preferences.ts). */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query<{ accessibility: unknown }>(
    "SELECT accessibility FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ prefs: sanitizeAccessibilityPrefs(rows[0].accessibility) });
}

/** Replaces them. Only the known on/off switches are kept. */
export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await readJsonBody(req, 4 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    if (error instanceof InvalidJsonBodyError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    throw error;
  }
  const prefs = sanitizeAccessibilityPrefs((body as { prefs?: unknown } | null)?.prefs);

  const { rows } = await db.query<{ accessibility: unknown }>(
    "UPDATE users SET accessibility = $1 WHERE email = $2 RETURNING accessibility",
    [JSON.stringify(prefs), session.user.email.toLowerCase()]
  );
  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ prefs: sanitizeAccessibilityPrefs(rows[0].accessibility) });
}
