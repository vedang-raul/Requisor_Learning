jest.mock("@/lib/db", () => ({
  db: { query: jest.fn() },
  roleForEmail: jest.fn(() => "employee"),
  ADMIN_EMAIL: "support@requisor.io",
}));

jest.mock("@/lib/email", () => ({
  sendWelcomeEmail: jest.fn(() => Promise.resolve()),
}));

import { authOptions } from "@/lib/auth";
import { db, roleForEmail } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

const mockedQuery = db.query as jest.Mock;
const mockedRoleForEmail = roleForEmail as jest.Mock;
const mockedWelcomeEmail = sendWelcomeEmail as jest.Mock;
const googleSignIn = authOptions.callbacks?.signIn;
if (typeof googleSignIn !== "function") {
  throw new Error("Google sign-in callback must be configured.");
}

function googleAttempt(overrides: Record<string, unknown> = {}) {
  return {
    user: { email: "Learner@Example.com", name: "Learner" },
    account: { provider: "google", providerAccountId: "google-subject-1" },
    profile: { email: "learner@example.com", email_verified: true },
    ...overrides,
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockedRoleForEmail.mockReturnValue("employee");
  mockedWelcomeEmail.mockReturnValue(Promise.resolve());
});

describe("Google sign-in account protection", () => {
  it("creates a new account only for a complete, verified Google identity", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 101 }] });

    const result = await googleSignIn(googleAttempt() as never);

    expect(result).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    expect(mockedQuery.mock.calls[0][1]).toEqual(["learner@example.com", "google-subject-1"]);
    expect(mockedQuery.mock.calls[1][1]).toEqual([
      "learner@example.com",
      "Learner",
      "google-subject-1",
      "employee",
    ]);
    expect(mockedQuery.mock.calls[1][0]).toContain("ON CONFLICT DO NOTHING");
    expect(mockedRoleForEmail).toHaveBeenCalledWith("learner@example.com");
    expect(mockedWelcomeEmail).toHaveBeenCalledWith("learner@example.com", "Learner");
  });

  it("allows a returning user only when the Google subject matches", async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 101,
          email: "learner@example.com",
          name: "Learner",
          password_hash: null,
          google_id: "google-subject-1",
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await googleSignIn(googleAttempt() as never);

    expect(result).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    expect(mockedQuery.mock.calls[1][1]).toEqual(["Learner", 101]);
    expect(mockedWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does not attach Google sign-in to an existing password account", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{
        id: 101,
        email: "learner@example.com",
        name: "Learner",
        password_hash: "hashed-password",
        google_id: null,
      }],
    });

    const result = await googleSignIn(googleAttempt() as never);

    expect(result).toBe("/?error=GoogleSignInFailed");
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedWelcomeEmail).not.toHaveBeenCalled();
  });

  it("rejects a different Google subject for an already-linked email", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{
        id: 101,
        email: "learner@example.com",
        name: "Learner",
        password_hash: null,
        google_id: "google-subject-original",
      }],
    });

    const result = await googleSignIn(googleAttempt() as never);

    expect(result).toBe("/?error=GoogleSignInFailed");
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedWelcomeEmail).not.toHaveBeenCalled();
  });

  it("rejects a known Google subject whose email claim changes", async () => {
    mockedQuery.mockResolvedValueOnce({
      rows: [{
        id: 101,
        email: "original@example.com",
        name: "Learner",
        password_hash: null,
        google_id: "google-subject-1",
      }],
    });

    const result = await googleSignIn(
      googleAttempt({
        user: { email: "changed@example.com", name: "Learner" },
        profile: { email: "changed@example.com", email_verified: true },
      }) as never
    );

    expect(result).toBe("/?error=GoogleSignInFailed");
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedWelcomeEmail).not.toHaveBeenCalled();
  });

  it.each([
    [
      "unverified email assertion",
      googleAttempt({ profile: { email: "learner@example.com", email_verified: false } }),
    ],
    [
      "missing email assertion",
      googleAttempt({ profile: { email_verified: true } }),
    ],
    [
      "missing provider account identifier",
      googleAttempt({ account: { provider: "google", providerAccountId: "" } }),
    ],
    [
      "mismatched mapped and asserted emails",
      googleAttempt({ profile: { email: "different@example.com", email_verified: true } }),
    ],
  ])("rejects %s before any database write", async (_reason, attempt) => {
    const result = await googleSignIn(attempt as never);

    expect(result).toBe("/?error=GoogleSignInFailed");
    expect(mockedQuery).not.toHaveBeenCalled();
    expect(mockedWelcomeEmail).not.toHaveBeenCalled();
  });

  it("does not overwrite an account created concurrently", async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await googleSignIn(googleAttempt() as never);

    expect(result).toBe("/?error=GoogleSignInFailed");
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    expect(mockedWelcomeEmail).not.toHaveBeenCalled();
  });
});