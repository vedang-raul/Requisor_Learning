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
import { TEST_ACCOUNT_PROVIDER, TEST_ACCOUNTS, testAccountsEnabled, testAccountPasswordMatches, testAccountAccess } from "@/lib/auth/test-accounts";

// Test fixture only: never used to configure a running application.
const fixturePassword = "unit-test-password-only-748239";
const originalPassword = process.env.TEST_ACCOUNT_PASSWORD;
const originalSwitch = process.env.TEST_ACCOUNT_LOGINS;
beforeEach(() => {
  process.env.TEST_ACCOUNT_LOGINS = "on";
  process.env.TEST_ACCOUNT_PASSWORD = fixturePassword;
  mockQuery.mockReset();
});
afterAll(() => {
  if (originalPassword === undefined) delete process.env.TEST_ACCOUNT_PASSWORD;
  else process.env.TEST_ACCOUNT_PASSWORD = originalPassword;
  if (originalSwitch === undefined) delete process.env.TEST_ACCOUNT_LOGINS;
  else process.env.TEST_ACCOUNT_LOGINS = originalSwitch;
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

it("is off unless explicitly enabled with a sufficiently long password", () => {
  delete process.env.TEST_ACCOUNT_LOGINS;
  expect(testAccountsEnabled()).toBe(false);
  expect(provider()).toBeUndefined();
  process.env.TEST_ACCOUNT_LOGINS = "on";
  delete process.env.TEST_ACCOUNT_PASSWORD;
  expect(testAccountsEnabled()).toBe(false);
  expect(provider()).toBeUndefined();
  process.env.TEST_ACCOUNT_PASSWORD = "short";
  expect(testAccountsEnabled()).toBe(false);
  expect(provider()).toBeUndefined();
});
it("rejects missing, malformed, wrong and oversized passwords", () => {
  for (const value of [undefined, null, 42, {}, "", "wrong-password-123456", "a".repeat(257)]) {
    expect(testAccountPasswordMatches(value)).toBe(false);
  }
  expect(testAccountPasswordMatches(fixturePassword)).toBe(true);
});
it("rejects invalid roles and wrong passwords before touching the database", async () => {
  const p = provider()!;
  for (const kind of ["admin", "__proto__", "constructor", "super-admin"]) {
    expect(await p.authorize({ kind, password: "wrong-password-123456" })).toBeNull();
  }
  expect(await p.authorize({ kind: "constructor", password: fixturePassword })).toBeNull();
  expect(mockQuery).not.toHaveBeenCalled();
});
it.each(["student", "university-admin", "super-admin"] as const)(
  "uses only a reserved synthetic identity for %s, ignoring supplied emails or roles", async kind => {
    const a = TEST_ACCOUNTS[kind];
    mockQuery.mockResolvedValue({ rows: [{ id: 101, email: a.email, name: a.name }] });
    expect(await provider()!.authorize({ kind, password: fixturePassword, email: "real-user@example.com", role: "admin" }))
      .toMatchObject({ id: "101", email: a.email });
    expect(mockQuery.mock.calls[0][1]).toEqual([a.email, a.name, a.role, kind !== "super-admin"]);
    expect(mockQuery.mock.calls[0][0]).toContain("Requisor Test University");
  }
);
it("returns a generic failed login on database failure", async () => {
  mockQuery.mockRejectedValue(new Error("private database detail"));
  const log = jest.spyOn(console, "error").mockImplementation(() => {});
  expect(await provider()!.authorize({ kind: "student", password: fixturePassword })).toBeNull();
  expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "test_account_login", outcome: "unavailable" }));
  log.mockRestore();
});
it("limits the test university admin and student to their active university", () => {
  const row = { role: "admin", university_id: 99, university_status: "active" };
  expect(testAccountAccess(TEST_ACCOUNTS["university-admin"].email, row))
    .toEqual({ role: "admin", superAdmin: false, universityId: 99, pending: false });
  expect(testAccountAccess(TEST_ACCOUNTS.student.email, { ...row, role: "employee" })?.superAdmin).toBe(false);
  expect(testAccountAccess(TEST_ACCOUNTS["university-admin"].email, { ...row, university_status: "pending" })).toBeNull();
  expect(testAccountAccess("real-user@example.com", row)).toBeNull();
});
it("issues super-admin access only for a session from the password-protected provider", async () => {
  const email = TEST_ACCOUNTS["super-admin"].email;
  mockQuery.mockResolvedValue({ rows: [{ id: 101, email, name: "Test", role: "admin", university_id: null, university_status: null }] });
  const privileged = await jwt({ token: { email }, user: { email }, account: { provider: TEST_ACCOUNT_PROVIDER } });
  expect(privileged.superAdmin).toBe(true);
  expect(privileged.uid).toBe("101");
  const ordinary = await jwt({ token: { email }, user: { email }, account: { provider: "credentials" } });
  expect(ordinary.superAdmin).toBe(false);
});
it("revokes test sessions after the password changes or the switch is disabled", async () => {
  const email = TEST_ACCOUNTS["super-admin"].email;
  mockQuery.mockResolvedValue({ rows: [{ id: 101, email, role: "admin", university_id: null, university_status: null }] });
  const issued = await jwt({ token: { email }, user: { email }, account: { provider: TEST_ACCOUNT_PROVIDER } });
  process.env.TEST_ACCOUNT_PASSWORD = "different-test-fixture-password";
  expect(await jwt({ token: issued })).toMatchObject({ uid: "", role: "employee", superAdmin: false, exp: 0 });
  process.env.TEST_ACCOUNT_PASSWORD = fixturePassword;
  process.env.TEST_ACCOUNT_LOGINS = "off";
  expect(await jwt({ token: issued })).toMatchObject({ uid: "", superAdmin: false });
});
it("rejects authorization if the switch is disabled after a provider was registered", async () => {
  const p = provider()!;
  process.env.TEST_ACCOUNT_LOGINS = "off";
  expect(await p.authorize({ kind: "super-admin", password: fixturePassword })).toBeNull();
  expect(mockQuery).not.toHaveBeenCalled();
});
