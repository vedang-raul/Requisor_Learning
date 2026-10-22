jest.mock("@/lib/server/db", () => ({
  db: { query: jest.fn() },
  roleForEmail: jest.fn(() => "employee"),
  ADMIN_EMAIL: "support@requisor.io",
}));
jest.mock("@/lib/server/email", () => ({ skipEmailVerification: () => false, sendWelcomeEmail: jest.fn() }));
jest.mock("@/lib/server/activity", () => ({ recordLogin: jest.fn() }));

import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth/auth";
import { checkEnvSuperAdmin } from "@/lib/auth/env-super-admin";
import { isSuperAdminEmail } from "@/lib/auth/roles";
import { db } from "@/lib/server/db";

const mockQuery = db.query as jest.Mock;
const ENV = { ...process.env };
// A throwaway test value, not anyone's real password.
const PASSWORD = "correct horse battery staple";
const providerId = (p: unknown) => (p as { options?: { id?: string } }).options?.id ?? (p as { id: string }).id;
const emailPassword = authOptions.providers.find((p) => providerId(p) === "credentials") as unknown as {
  options: { authorize: (c: Record<string, string>) => Promise<Record<string, unknown> | null> };
};
const signIn = (email: string, password: string) => emailPassword.options.authorize({ email, password });

describe("super admin sign-in from the environment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ENV, SUPER_ADMIN_LOGIN_EMAIL: "Boss@Requisor.io" };
    delete process.env.SUPER_ADMIN_LOGIN_PASSWORD;
    delete process.env.SUPER_ADMIN_LOGIN_PASSWORD_HASH;
  });
  afterAll(() => { process.env = ENV; });

  it("checks the password against the bcrypt hash", async () => {
    process.env.SUPER_ADMIN_LOGIN_PASSWORD_HASH = await bcrypt.hash(PASSWORD, 4);
    expect(await checkEnvSuperAdmin("boss@requisor.io", PASSWORD)).toBe("ok");
    expect(await checkEnvSuperAdmin("boss@requisor.io", "wrong password here")).toBe("wrong");
  });

  it("accepts a plain password of 12+ characters when no hash is set", async () => {
    process.env.SUPER_ADMIN_LOGIN_PASSWORD = PASSWORD;
    expect(await checkEnvSuperAdmin("boss@requisor.io", PASSWORD)).toBe("ok");
    expect(await checkEnvSuperAdmin("boss@requisor.io", PASSWORD + "x")).toBe("wrong");
  });

  it("never lets a configured email in without a usable password", async () => {
    process.env.SUPER_ADMIN_LOGIN_PASSWORD = "short";
    expect(await checkEnvSuperAdmin("boss@requisor.io", "short")).toBe("wrong");
    process.env.SUPER_ADMIN_LOGIN_PASSWORD_HASH = "not-a-bcrypt-hash";
    expect(await checkEnvSuperAdmin("boss@requisor.io", "short")).toBe("wrong");
  });

  it("leaves every other email to the database", async () => {
    process.env.SUPER_ADMIN_LOGIN_PASSWORD = PASSWORD;
    expect(await checkEnvSuperAdmin("someone@example.com", PASSWORD)).toBe("not-configured");
    delete process.env.SUPER_ADMIN_LOGIN_EMAIL;
    expect(await checkEnvSuperAdmin("boss@requisor.io", PASSWORD)).toBe("not-configured");
  });

  it("makes the configured email a super admin", () => {
    expect(isSuperAdminEmail("boss@requisor.io")).toBe(true);
    delete process.env.SUPER_ADMIN_LOGIN_EMAIL;
    expect(isSuperAdminEmail("boss@requisor.io")).toBe(false);
  });

  it("signs in through the normal login form and confirms the account in the database", async () => {
    process.env.SUPER_ADMIN_LOGIN_PASSWORD_HASH = await bcrypt.hash(PASSWORD, 4);
    mockQuery.mockResolvedValue({ rows: [{ id: 9, email: "boss@requisor.io", name: "Super Admin", session_version: 2 }] });
    expect(await signIn(" BOSS@requisor.io ", PASSWORD)).toEqual({ id: "9", email: "boss@requisor.io", name: "Super Admin", sessionVersion: 2 });
    expect(String(mockQuery.mock.calls[0][0])).toContain("INSERT INTO users");
    expect(mockQuery.mock.calls[0][1]).toEqual(["boss@requisor.io"]);
  });

  it("rejects a wrong password before touching the database, even if the account has another one stored", async () => {
    process.env.SUPER_ADMIN_LOGIN_PASSWORD_HASH = await bcrypt.hash(PASSWORD, 4);
    await expect(signIn("boss@requisor.io", "an old database password")).rejects.toThrow("Invalid email or password.");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
