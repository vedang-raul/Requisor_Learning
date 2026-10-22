jest.mock("@/lib/server/db", () => ({
  db: { query: jest.fn() },
  roleForEmail: jest.fn(() => "employee"),
  ADMIN_EMAIL: "support@requisor.io",
}));
jest.mock("@/lib/server/email", () => ({ skipEmailVerification: () => false, sendWelcomeEmail: jest.fn() }));
jest.mock("@/lib/server/activity", () => ({ recordLogin: jest.fn() }));
jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));

import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { getToken } from "next-auth/jwt";

const mockQuery = db.query as jest.Mock;
const mockToken = getToken as jest.Mock;
type Authorize = (credentials: Record<string, string>, req: { headers: Record<string, string> }) => Promise<Record<string, unknown> | null>;
// Before NextAuth processes them, a credentials provider's own id sits in its options.
const providerId = (p: unknown) => (p as { options?: { id?: string } }).options?.id ?? (p as { id: string }).id;
const viewAs = authOptions.providers.find((p) => providerId(p) === "view-as") as unknown as { options: { authorize: Authorize } };
const authorize: Authorize = (c, r) => viewAs.options.authorize(c, r);
const req = { headers: { cookie: "next-auth.session-token=x" } };

const SUPER = { id: 130, email: "support@requisor.io", name: "Support", role: "admin", university_id: null, university_status: null };
const TUTOR = { id: 1, email: "dev-tutor@requisor.local", name: "Test Tutor", role: "tutor" };

describe('"view as" for super admins', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it("is the only test-account sign-in a production build offers", () => {
    expect(viewAs).toBeDefined();
    const ids = authOptions.providers.map(providerId);
    expect(ids).not.toContain("public-test-accounts");
  });

  it("refuses anyone who isn't signed in as a super admin", async () => {
    mockToken.mockResolvedValue({ uid: "7", superAdmin: false });
    expect(await authorize({ kind: "tutor" }, req)).toBeNull();
    mockToken.mockResolvedValue(null);
    expect(await authorize({ kind: "tutor" }, req)).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("refuses a session that claims super admin when the database no longer agrees", async () => {
    mockToken.mockResolvedValue({ uid: "55", superAdmin: true });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 55, email: "former@example.com", role: "admin", university_id: 2, university_status: "active" }] });
    expect(await authorize({ kind: "tutor" }, req)).toBeNull();
  });

  it("switches a super admin into the test tutor, remembering who they are", async () => {
    mockToken.mockResolvedValue({ uid: "130", superAdmin: true });
    mockQuery.mockResolvedValueOnce({ rows: [SUPER] }).mockResolvedValueOnce({ rows: [TUTOR] });
    expect(await authorize({ kind: "tutor" }, req)).toEqual({ id: "1", email: TUTOR.email, name: "Test Tutor", viewAsBy: "130" });
    // Only the reserved test account is ever touched.
    expect(mockQuery.mock.calls[1][1]).toEqual(["dev-tutor@requisor.local"]);
  });

  it("switches back to the super admin who started it", async () => {
    mockToken.mockResolvedValue({ uid: "1", superAdmin: false, viewAsBy: "130" });
    mockQuery.mockResolvedValueOnce({ rows: [SUPER] });
    expect(await authorize({ kind: "back" }, req)).toEqual({ id: "130", email: SUPER.email, name: "Support", viewAsBy: undefined });
  });

  it("only allows the three test accounts", async () => {
    mockToken.mockResolvedValue({ uid: "130", superAdmin: true });
    mockQuery.mockResolvedValue({ rows: [SUPER] });
    for (const kind of ["super-admin", "admin", "someone@example.com", ""]) {
      expect(await authorize({ kind }, req)).toBeNull();
    }
  });

  it("marks the session only when it came from view as", async () => {
    const jwt = authOptions.callbacks!.jwt!;
    mockQuery.mockResolvedValue({ rows: [{ ...TUTOR, session_version: 0, university_id: null, university_status: null }] });
    const viewing = await jwt({ token: {}, user: { id: "1", email: TUTOR.email, viewAsBy: "130" }, account: { provider: "view-as" } } as never);
    expect(viewing.viewAsBy).toBe("130");
    const normal = await jwt({ token: { viewAsBy: "130" }, user: { id: "1", email: TUTOR.email, viewAsBy: "130" }, account: { provider: "credentials" } } as never);
    expect(normal.viewAsBy).toBeUndefined();
  });
});
