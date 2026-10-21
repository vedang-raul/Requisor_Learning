const mockQuery = jest.fn();
jest.mock("@/lib/server/db", () => ({
  db: { query: mockQuery }, roleForEmail: jest.fn(() => "employee"), ADMIN_EMAIL: "admin@example.com",
}));
jest.mock("@/lib/server/email", () => ({ skipEmailVerification: () => false, sendWelcomeEmail: jest.fn() }));
jest.mock("next-auth/providers/google", () => ({ __esModule: true, default: () => ({ id: "google" }) }));
jest.mock("next-auth/providers/credentials", () => ({
  __esModule: true, default: (options: Record<string, unknown>) => ({ id: "credentials", ...options }),
}));
import { authOptions } from "@/lib/auth/auth";
import { TEST_ACCOUNT_PROVIDER, TEST_ACCOUNTS, testAccountsEnabled, testAccountAccess } from "@/lib/auth/test-accounts";

const originalSwitch = process.env.PUBLIC_TEST_LOGINS;
beforeEach(() => {
  process.env.PUBLIC_TEST_LOGINS = "on";
  mockQuery.mockReset();
});
afterAll(() => {
  if (originalSwitch === undefined) delete process.env.PUBLIC_TEST_LOGINS;
  else process.env.PUBLIC_TEST_LOGINS = originalSwitch;
});
function provider() {
  let found: { authorize: (credentials: Record<string, unknown>) => Promise<unknown> } | undefined;
  jest.isolateModules(() => {
    found = require("@/lib/auth/auth").authOptions.providers.find((p: { id: string }) => p.id === TEST_ACCOUNT_PROVIDER);
  });
  return found;
}
async function jwt(args: Record<string, unknown>) {
  return (authOptions.callbacks!.jwt as Function)(args);
}

it("requires an explicit on switch and no password or secret", () => {
  expect(testAccountsEnabled()).toBe(true);
  expect(provider()).toBeDefined();
  for (const value of [undefined, "off", "true", ""]) {
    if (value === undefined) delete process.env.PUBLIC_TEST_LOGINS;
    else process.env.PUBLIC_TEST_LOGINS = value;
    expect(testAccountsEnabled()).toBe(false);
    expect(provider()).toBeUndefined();
  }
});
it("rejects malformed account kinds before touching the database", async () => {
  const p = provider()!;
  for (const kind of ["admin", "__proto__", "constructor", undefined, null, {}, 1]) {
    expect(await p.authorize({ kind })).toBeNull();
  }
  expect(mockQuery).not.toHaveBeenCalled();
});
it.each(["student", "university-admin", "super-admin"] as const)(
  "signs in as the reserved %s without a password, ignoring arbitrary identities", async kind => {
    const a = TEST_ACCOUNTS[kind];
    mockQuery.mockResolvedValue({ rows: [{ id: 101, email: a.email, name: a.name }] });
    expect(await provider()!.authorize({ kind, email: "real-user@example.com", role: "admin" }))
      .toMatchObject({ id: "101", email: a.email });
    expect(mockQuery.mock.calls[0][1]).toEqual([a.email, a.name, a.role, kind !== "super-admin"]);
    expect(mockQuery.mock.calls[0][0]).toContain("Requisor Test University");
    expect(mockQuery.mock.calls[0][0]).toContain("password_hash = NULL");
  }
);
it("returns a generic failed login on database failure", async () => {
  mockQuery.mockRejectedValue(new Error("private database detail"));
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  expect(await provider()!.authorize({ kind: "student" })).toBeNull();
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "test_account_login", outcome: "unavailable" }));
  log.mockRestore();
});
it("scopes university admin and student access to their active university", () => {
  const row = { role: "admin", university_id: 99, university_status: "active" };
  expect(testAccountAccess(TEST_ACCOUNTS["university-admin"].email, row))
    .toEqual({ role: "admin", superAdmin: false, universityId: 99, pending: false });
  expect(testAccountAccess(TEST_ACCOUNTS.student.email, { ...row, role: "employee" }))
    .toEqual({ role: "employee", superAdmin: false, universityId: 99, pending: false });
  expect(testAccountAccess(TEST_ACCOUNTS["university-admin"].email, { ...row, university_status: "pending" })).toBeNull();
  expect(testAccountAccess("real-user@example.com", row)).toBeNull();
});
it("grants test super-admin access only to sessions issued by the dedicated test provider", async () => {
  const email = TEST_ACCOUNTS["super-admin"].email;
  mockQuery.mockResolvedValue({ rows: [{ id: 101, email, name: "Test", role: "admin", university_id: null, university_status: null }] });
  const privileged = await jwt({ token: { email }, user: { email }, account: { provider: TEST_ACCOUNT_PROVIDER } });
  expect(privileged.superAdmin).toBe(true);
  expect(privileged.uid).toBe("101");
  const ordinary = await jwt({ token: { email }, user: { email }, account: { provider: "credentials" } });
  expect(ordinary.superAdmin).toBe(false);
});
it("revokes a test session on session refresh after the switch is disabled", async () => {
  const email = TEST_ACCOUNTS["super-admin"].email;
  mockQuery.mockResolvedValue({ rows: [{ id: 101, email, role: "admin", university_id: null, university_status: null }] });
  const issued = await jwt({ token: { email }, user: { email }, account: { provider: TEST_ACCOUNT_PROVIDER } });
  process.env.PUBLIC_TEST_LOGINS = "off";
  expect(await jwt({ token: issued })).toMatchObject({ uid: "", role: "employee", superAdmin: false, exp: 0 });
});
it("checks the switch again on every authorization, not just registration", async () => {
  const p = provider()!;
  process.env.PUBLIC_TEST_LOGINS = "off";
  expect(await p.authorize({ kind: "super-admin" })).toBeNull();
  expect(mockQuery).not.toHaveBeenCalled();
});
