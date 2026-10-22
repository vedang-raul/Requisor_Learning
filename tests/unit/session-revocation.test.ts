jest.mock("@/lib/server/db", () => ({
  db: { query: jest.fn() },
  roleForEmail: jest.fn(() => "employee"),
  ADMIN_EMAIL: "admin@example.com",
}));
jest.mock("@/lib/server/email", () => ({
  skipEmailVerification: () => false,
  sendWelcomeEmail: jest.fn(),
}));
jest.mock("@/lib/auth/turnstile", () => ({
  verifyTurnstile: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("new-password-hash"),
}));

import crypto from "crypto";
import { getServerSession, type NextAuthOptions } from "next-auth";
import { encode } from "next-auth/jwt";
import { authOptions } from "@/lib/auth/auth";
import { db } from "@/lib/server/db";
import { POST } from "@/app/api/reset/route";

const query = db.query as jest.Mock;
const secret = "isolated-session-revocation-test-secret";
const resetToken = "a".repeat(64);
const resetHash = crypto.createHash("sha256").update(resetToken).digest("hex");
const now = Math.floor(Date.now() / 1000);
const logger = { error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
const options: NextAuthOptions = { ...authOptions, secret, logger };
let user: Record<string, unknown>;

async function cookie(version: number | undefined = 0, role = "employee") {
  return encode({
    secret,
    maxAge: 3600,
    token: {
      email: "learner@example.com", uid: "101", role,
      sessionVersion: version, lastActivity: now, accessCheckedAt: now,
    },
  });
}

async function session(value: string) {
  const response = { getHeader: jest.fn(), setHeader: jest.fn() };
  const result = await getServerSession(
    { headers: {}, cookies: { "next-auth.session-token": value } } as never,
    response as never,
    options,
  );
  return { result, response };
}

function resetRequest(token = resetToken) {
  return new Request("http://localhost/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password: "new-password123" }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  user = {
    id: 101, email: "learner@example.com", role: "employee",
    session_version: 0, reset_token: resetHash,
    reset_expires: new Date(Date.now() + 60_000),
  };
  query.mockReset().mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.startsWith("SELECT * FROM users WHERE reset_token")) {
      return { rows: user.reset_token === params[0] ? [{ ...user }] : [] };
    }
    if (sql.includes("SET password_hash")) {
      if (user.reset_token !== params[2] ||
          (user.reset_expires && (user.reset_expires as Date).getTime() <= Date.now())) {
        return { rows: [] };
      }
      user.session_version = Number(user.session_version) + 1;
      user.password_hash = params[0];
      user.reset_token = null;
      return { rows: [{ id: user.id }] };
    }
    return { rows: [{ ...user }] };
  });
});

it.each(["employee", "tutor", "admin"])(
  "revokes all existing %s cookies immediately after recovery, including recently checked ones",
  async role => {
    user.role = role;
    const stolenCookie = await cookie(0, role);
    const otherBrowserCookie = await cookie(0, role);
    expect((await session(stolenCookie)).result?.user.role).toBe(role);
    expect((await POST(resetRequest())).status).toBe(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("session_version = session_version + 1"),
      ["new-password-hash", 101, resetHash],
    );
    for (const oldCookie of [stolenCookie, otherBrowserCookie]) {
      const { result, response } = await session(oldCookie);
      expect(result).toBeNull(); // No email-only or role-only session can escape.
      expect(response.setHeader).toHaveBeenCalledWith(
        "Set-Cookie", expect.arrayContaining([expect.stringContaining("Max-Age=0")]),
      );
    }
    expect((await session(await cookie(1, role))).result?.user.id).toBe("101");
    expect((await POST(resetRequest())).status).toBe(400);
    expect(user.session_version).toBe(1);
  },
);

it("accepts legacy cookies only until the first password reset", async () => {
  const legacyCookie = await encode({
    secret, maxAge: 3600,
    token: { email: user.email as string, uid: "101", role: "employee", accessCheckedAt: now },
  });
  expect((await session(legacyCookie)).result?.user.id).toBe("101");
  await POST(resetRequest());
  expect((await session(legacyCookie)).result).toBeNull();
});

it("does not trust a version supplied through a client session update", async () => {
  user.session_version = 1;
  await expect(authOptions.callbacks!.jwt!({
    token: { email: user.email, uid: "101", sessionVersion: 0, accessCheckedAt: now },
    trigger: "update", session: { sessionVersion: 1 },
  } as never)).rejects.toThrow("revoked");
});

it("rejects a password sign-in if recovery happened after password verification", async () => {
  user.session_version = 1;
  await expect(authOptions.callbacks!.jwt!({
    token: {}, user: { email: user.email, sessionVersion: 0 },
  } as never)).rejects.toThrow("revoked");
  const fresh = await authOptions.callbacks!.jwt!({
    token: {}, user: { email: user.email, sessionVersion: 1 },
  } as never);
  expect(fresh.sessionVersion).toBe(1);
});

it("fails closed if the account disappears or its database check fails", async () => {
  const value = await cookie();
  query.mockResolvedValueOnce({ rows: [] });
  expect((await session(value)).result).toBeNull();
  query.mockRejectedValueOnce(new Error("Database unavailable"));
  expect((await session(value)).result).toBeNull();
});

it("does not revoke sessions for an invalid or expired link", async () => {
  expect((await POST(resetRequest("b".repeat(64)))).status).toBe(400);
  user.reset_expires = new Date(Date.now() - 1000);
  expect((await POST(resetRequest())).status).toBe(400);
  expect(user.session_version).toBe(0);
  expect(query.mock.calls.some(([sql]) => sql.includes("SET password_hash"))).toBe(false);
});

it("allows only one of two concurrent reset requests to consume the link", async () => {
  const responses = await Promise.all([POST(resetRequest()), POST(resetRequest())]);
  expect(responses.map(r => r.status).sort()).toEqual([200, 400]);
  expect(user.session_version).toBe(1);
});

it("does not report success when the link expires during password hashing", async () => {
  query.mockImplementationOnce(async () => {
    const snapshot = { ...user };
    user.reset_expires = new Date(Date.now() - 1000);
    return { rows: [snapshot] };
  });
  expect((await POST(resetRequest())).status).toBe(400);
  expect(user.session_version).toBe(0);
});
