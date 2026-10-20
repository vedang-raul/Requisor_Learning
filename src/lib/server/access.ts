import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/auth";

/**
 * The signed-in person's access, for API routes:
 *   const who = await requireAccess("admin");
 *   if (who instanceof Response) return who;
 * "admin" admits university admins and super admins; "super" only super admins.
 */
export type RequestAccess = {
  userId: number;
  email: string;
  role: "employee" | "tutor" | "admin";
  superAdmin: boolean;
  universityId: number | null;
};

export async function currentAccess(): Promise<RequestAccess | null> {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!session?.user?.email || !Number.isSafeInteger(userId) || userId < 1) return null;
  // Waiting for a university's approval: no access to anything yet. (The
  // middleware already blocks these requests; this is the second line.)
  if (session.user.pending === true) return null;
  return {
    userId,
    email: session.user.email.toLowerCase(),
    role: session.user.role,
    superAdmin: session.user.superAdmin === true,
    universityId: typeof session.user.universityId === "number" ? session.user.universityId : null,
  };
}

export async function requireAccess(level: "signed-in" | "tutor" | "admin" | "super"): Promise<RequestAccess | Response> {
  const who = await currentAccess();
  if (!who) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const allowed =
    level === "signed-in" ? true
      : level === "tutor" ? who.role === "tutor" || who.role === "admin"
        : level === "admin" ? who.role === "admin"
          : who.superAdmin;
  return allowed ? who : Response.json({ error: "Forbidden" }, { status: 403 });
}
