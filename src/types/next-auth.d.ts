import "next-auth";

declare module "next-auth" {
  interface User {
    /** Server-only snapshot taken when the password was verified. */
    sessionVersion?: number;
  }

  interface Session {
    user: {
      id: string;
      role: "employee" | "tutor" | "admin";
      /** The Requisor team: an admin with no university limit (see src/lib/auth/roles.ts). */
      superAdmin: boolean;
      /** The university this person belongs to, once it has accepted them. */
      universityId: number | null;
      /** Waiting for a university admin to approve them: no access until then. */
      pending: boolean;
      /** The university they're waiting on, for the waiting page. */
      pendingUniversity: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
