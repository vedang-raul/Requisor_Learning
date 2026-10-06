// Google sign-in is only attempted when it is configured; these tests exercise that configured path.
process.env.GOOGLE_CLIENT_ID = "client-1";
process.env.GOOGLE_CLIENT_SECRET = "secret-1";

/**
 * __tests__/turnstile-routes.test.ts
 *
 * Verifies that CAPTCHA enforcement is wired into the login, signup,
 * forgot-password, password-reset, and Google-initiate routes.
 *
 * lib/turnstile is mocked so tests run without Cloudflare credentials.
 * The mock exposes a controllable function so individual tests can simulate
 * failed vs. passed CAPTCHA without external network calls.
 */

// ── Mocks (hoisted before all imports) ───────────────────────────────────────

const mockVerifyTurnstile = jest.fn<
  Promise<{ success: boolean }>,
  [string | null | undefined]
>();

jest.mock("@/lib/turnstile", () => ({
  isTurnstileEnabled: () => process.env.TURNSTILE_ENABLED === "true",
  verifyTurnstile: (...args: [string | null | undefined]) =>
    mockVerifyTurnstile(...args),
}));

// Rate limiter — controllable mock so tests can simulate both allowed and
// limited states.  Default behaviour (always allow) is restored in beforeEach.
const mockRateLimitCheck = jest.fn(() => ({ limited: false, retryAfterMs: 0 }));
const mockReadJsonBody = jest.fn<Promise<unknown>, [Request, number]>(async (req: Request) => req.json());
class MockRequestBodyTooLargeError extends Error {}
class MockInvalidJsonBodyError extends Error {}

jest.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({ check: (_key: string) => mockRateLimitCheck() }),
  rateLimitResponse: jest.fn((_retryAfterMs: number) =>
    new Response(
      JSON.stringify({ error: "Too many requests. Please wait a moment before trying again." }),
      { status: 429, headers: { "Retry-After": "900", "Content-Type": "application/json" } }
    )
  ),
}));

jest.mock("next-auth", () => {
  const handlerFn = jest.fn(async () => new Response("OK", { status: 200 }));
  const NextAuth = jest.fn(() => handlerFn);
  (NextAuth as unknown as Record<string, unknown>).__handler = handlerFn;
  return NextAuth;
});

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/db", () => ({
  db: { query: jest.fn().mockResolvedValue({ rows: [] }) },
  roleForEmail: jest.fn(() => "employee"),
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    after: jest.fn((fn: () => void) => fn()),
  };
});

jest.mock("@/lib/request-body", () => ({
  readJsonBody: (...args: [Request, number]) => mockReadJsonBody(...args),
  RequestBodyTooLargeError: MockRequestBodyTooLargeError,
  InvalidJsonBodyError: MockInvalidJsonBodyError,
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { POST as signupPost } from "@/app/api/signup/route";
import { POST as forgotPost } from "@/app/api/forgot/route";
import { POST as resetPost } from "@/app/api/reset/route";
import { POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import { POST as googleInitiatePost } from "@/app/api/auth/google-initiate/route";
// Real captcha-grant implementation used so we can issue + verify grants in tests.
import { issueGrant, GRANT_COOKIE_NAME } from "@/lib/captcha-grant";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSignupRequest(token?: string) {
  return new Request("http://localhost/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Alice",
      email: "alice@example.com",
      password: "securepassword",
      employmentType: "intern",
      ...(token !== undefined ? { turnstileToken: token } : {}),
    }),
  });
}

function makeForgotRequest(token?: string) {
  return new Request("http://localhost/api/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "alice@example.com",
      ...(token !== undefined ? { turnstileToken: token } : {}),
    }),
  });
}

// A syntactically valid reset token (64 lowercase hex chars). The route
// validates the shape before CAPTCHA, so the token must pass that check for
// these tests to exercise the CAPTCHA gate rather than the format guard.
const VALID_RESET_TOKEN = "a".repeat(64);

function makeResetRequest(token?: string) {
  return new Request("http://localhost/api/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: VALID_RESET_TOKEN,
      password: "securepassword",
      ...(token !== undefined ? { turnstileToken: token } : {}),
    }),
  });
}

function makeCredentialsRequest(token?: string) {
  // NextAuth sends credentials as URL-encoded form data.
  const body = new URLSearchParams({
    email: "alice@example.com",
    password: "password123",
    csrfToken: "csrf",
    ...(token !== undefined ? { turnstileToken: token } : {}),
  });
  return new Request("http://localhost/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

function makeGoogleInitiateRequest(token?: string) {
  return new Request("http://localhost/api/auth/google-initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token !== undefined ? { token } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TURNSTILE_ENABLED = "true";
  mockVerifyTurnstile.mockResolvedValue({ success: true });
  // Restore the default "always allow" behaviour so CAPTCHA-focused tests are
  // not affected by rate-limit state set in rate-limiting tests.
  mockRateLimitCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
});

afterAll(() => {
  delete process.env.TURNSTILE_ENABLED;
});

// ── POST /api/signup ──────────────────────────────────────────────────────────

describe("POST /api/signup — CAPTCHA enforcement", () => {
  it("returns 413 for a body over the endpoint limit before CAPTCHA verification", async () => {
    mockReadJsonBody.mockRejectedValueOnce(new MockRequestBodyTooLargeError());

    const res = await signupPost(makeSignupRequest("good-token"));

    expect(res.status).toBe(413);
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON before CAPTCHA verification", async () => {
    mockReadJsonBody.mockRejectedValueOnce(new MockInvalidJsonBodyError());

    const res = await signupPost(makeSignupRequest("good-token"));

    expect(res.status).toBe(400);
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });

  it("returns 403 when CAPTCHA verification fails", async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    const res = await signupPost(makeSignupRequest("bad-token"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/bot check/i);
  });

  it("calls verifyTurnstile with the submitted token", async () => {
    await signupPost(makeSignupRequest("my-token"));
    expect(mockVerifyTurnstile).toHaveBeenCalledWith("my-token");
  });

  it("passes through when CAPTCHA succeeds", async () => {
    const res = await signupPost(makeSignupRequest("good-token"));
    expect(res.status).not.toBe(403);
  });

  it("passes null to verifyTurnstile when no token is supplied", async () => {
    await signupPost(makeSignupRequest());
    expect(mockVerifyTurnstile).toHaveBeenCalledWith(null);
  });

  it("creates a public tutor signup as an employee", async () => {
    const { db } = jest.requireMock("@/lib/db") as { db: { query: jest.Mock } };
    const req = new Request("http://localhost/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Unapproved Tutor",
        email: "unapproved@example.com",
        password: "securepassword",
        employmentType: "faculty",
        accountType: "tutor",
        turnstileToken: "good-token",
      }),
    });

    const res = await signupPost(req);
    const insertCall = db.query.mock.calls.find(([sql]) =>
      String(sql).includes("INSERT INTO users")
    );

    expect(res.status).toBe(200);
    expect(insertCall?.[1]?.[3]).toBe("employee");
  });
});

// ── POST /api/forgot ──────────────────────────────────────────────────────────

describe("POST /api/forgot — CAPTCHA enforcement", () => {
  it("returns 403 when CAPTCHA verification fails", async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    const res = await forgotPost(makeForgotRequest("bad-token"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/bot check/i);
  });

  it("passes through when CAPTCHA succeeds", async () => {
    const res = await forgotPost(makeForgotRequest("good-token"));
    // Always-200 regardless of whether the email exists (timing attack prevention)
    expect(res.status).not.toBe(403);
  });

  it("calls verifyTurnstile with the submitted token", async () => {
    await forgotPost(makeForgotRequest("my-token"));
    expect(mockVerifyTurnstile).toHaveBeenCalledWith("my-token");
  });
});

// ── POST /api/reset ─────────────────────────────────────────────

describe("POST /api/reset — CAPTCHA enforcement", () => {
  it("returns 403 when CAPTCHA verification fails", async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    const res = await resetPost(makeResetRequest("bad-token"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/bot check/i);
  });

  it("does not touch the database when CAPTCHA fails", async () => {
    const { db } = jest.requireMock("@/lib/db") as { db: { query: jest.Mock } };
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    await resetPost(makeResetRequest("bad-token"));
    expect(db.query).not.toHaveBeenCalled();
  });

  it("passes through when CAPTCHA succeeds", async () => {
    const res = await resetPost(makeResetRequest("good-token"));
    expect(res.status).not.toBe(403);
  });

  it("calls verifyTurnstile with the submitted token", async () => {
    await resetPost(makeResetRequest("my-token"));
    expect(mockVerifyTurnstile).toHaveBeenCalledWith("my-token");
  });

  it("passes null to verifyTurnstile when no token is supplied", async () => {
    await resetPost(makeResetRequest());
    expect(mockVerifyTurnstile).toHaveBeenCalledWith(null);
  });

  it("rejects a malformed reset token before CAPTCHA verification", async () => {
    const res = await resetPost(
      new Request("http://localhost/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "not-hex", password: "securepassword" }),
      })
    );
    expect(res.status).toBe(400);
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });
});

// ── POST /api/auth/callback/credentials ──────────────────────────────────────

describe("POST /api/auth/callback/credentials — CAPTCHA enforcement", () => {
  const ctx = { params: Promise.resolve({ nextauth: ["callback", "credentials"] }) };

  it("returns 403 when CAPTCHA verification fails", async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    const res = await authPost(makeCredentialsRequest("bad-token"), ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/bot check/i);
  });

  it("does not call NextAuth when CAPTCHA fails", async () => {
    const { default: NextAuth } = await import("next-auth");
    const handler = (NextAuth as unknown as { __handler: jest.Mock }).__handler;
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    await authPost(makeCredentialsRequest(), ctx);
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes through to NextAuth when CAPTCHA succeeds", async () => {
    const res = await authPost(makeCredentialsRequest("good-token"), ctx);
    expect(res.status).not.toBe(403);
  });
});

// ── POST /api/auth/google-initiate ────────────────────────────────────────────

describe("POST /api/auth/google-initiate — CAPTCHA gate", () => {

  it("returns 413 for a body over the endpoint limit", async () => {
    mockReadJsonBody.mockRejectedValueOnce(new MockRequestBodyTooLargeError());

    const res = await googleInitiatePost(makeGoogleInitiateRequest("good-token"));

    expect(res.status).toBe(413);
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });

  it("returns 400 for unsupported Google initiation fields", async () => {
    const req = new Request("http://localhost/api/auth/google-initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "good-token", role: "tutor" }),
    });

    const res = await googleInitiatePost(req);

    expect(res.status).toBe(400);
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });

  it("returns 200 when CAPTCHA succeeds", async () => {
    const res = await googleInitiatePost(makeGoogleInitiateRequest("good-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("sets a captcha-grant cookie on success", async () => {
    const res = await googleInitiatePost(makeGoogleInitiateRequest("good-token"));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(new RegExp(`${GRANT_COOKIE_NAME}=`));
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
  });

  it("clears a stale tutor role intent when learner initiation omits account type", async () => {
    const res = await googleInitiatePost(makeGoogleInitiateRequest("good-token"));
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(setCookie).toMatch(/google-role-intent=;/i);
    expect(setCookie).toMatch(/Max-Age=0/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  it("does not issue a tutor role intent when a public caller requests tutor access", async () => {
    const req = new Request("http://localhost/api/auth/google-initiate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "good-token", accountType: "tutor" }),
    });

    const res = await googleInitiatePost(req);
    const setCookie = res.headers.get("set-cookie") ?? "";

    expect(res.status).toBe(200);
    expect(setCookie).toMatch(/google-role-intent=;.*Max-Age=0/i);
    expect(setCookie).not.toMatch(/google-role-intent=[^;,]/i);
  });

  it("returns 403 when CAPTCHA fails", async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    const res = await googleInitiatePost(makeGoogleInitiateRequest("bad-token"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/bot check/i);
  });

  it("returns 403 when no token is provided", async () => {
    mockVerifyTurnstile.mockResolvedValueOnce({ success: false });
    const res = await googleInitiatePost(makeGoogleInitiateRequest());
    expect(res.status).toBe(403);
  });

  it("calls verifyTurnstile with the provided token", async () => {
    await googleInitiatePost(makeGoogleInitiateRequest("my-token"));
    expect(mockVerifyTurnstile).toHaveBeenCalledWith("my-token");
  });
});

// ── POST /api/auth/google-initiate — IP rate limiting ────────────────────────

describe("POST /api/auth/google-initiate — IP rate limiting", () => {
  it("returns 429 when the rate limit is exceeded", async () => {
    mockRateLimitCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 60_000 });
    const res = await googleInitiatePost(makeGoogleInitiateRequest("good-token"));
    expect(res.status).toBe(429);
  });

  it("includes a Retry-After header in the 429 response", async () => {
    mockRateLimitCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 60_000 });
    const res = await googleInitiatePost(makeGoogleInitiateRequest("good-token"));
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("does not call verifyTurnstile when the rate limit is exceeded", async () => {
    mockRateLimitCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 60_000 });
    await googleInitiatePost(makeGoogleInitiateRequest("good-token"));
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });

  it("allows the request through when the rate limit is not exceeded", async () => {
    // mockRateLimitCheck is reset to always-allow in beforeEach.
    const res = await googleInitiatePost(makeGoogleInitiateRequest("good-token"));
    expect(res.status).toBe(200);
  });

  it("skips CAPTCHA and clears learner role intent while Turnstile is disabled", async () => {
    delete process.env.TURNSTILE_ENABLED;
    const res = await googleInitiatePost(makeGoogleInitiateRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/google-role-intent=;.*Max-Age=0/i);
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });
});

// ── POST /api/auth/signin/google — grant cookie enforcement ───────────────────

describe("POST /api/auth/signin/google — captcha-grant cookie required", () => {
  const googleSigninCtx = {
    params: Promise.resolve({ nextauth: ["signin", "google"] }),
  };

  function makeGoogleSigninRequest(grantValue?: string) {
    return new Request("http://localhost/api/auth/signin/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(grantValue !== undefined
          ? { Cookie: `${GRANT_COOKIE_NAME}=${grantValue}` }
          : {}),
      },
      body: new URLSearchParams({ csrfToken: "csrf", callbackUrl: "/app/dashboard/" }).toString(),
    });
  }

  it("returns 403 when no grant cookie is present", async () => {
    const res = await authPost(makeGoogleSigninRequest(), googleSigninCtx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/bot check/i);
  });

  it("returns 403 when the grant cookie has an invalid signature", async () => {
    const res = await authPost(makeGoogleSigninRequest("12345678.deadbeef".padEnd(79, "0")), googleSigninCtx);
    expect(res.status).toBe(403);
  });

  it("passes to NextAuth when a valid grant cookie is present", async () => {
    // Issue a real grant using the same library the route uses.
    const { value } = issueGrant();
    const res = await authPost(makeGoogleSigninRequest(value), googleSigninCtx);
    // The NextAuth mock handler returns 200.
    expect(res.status).toBe(200);
  });

  it("does not call Turnstile again for the Google signin path", async () => {
    const { value } = issueGrant();
    await authPost(makeGoogleSigninRequest(value), googleSigninCtx);
    // Turnstile mock should not have been called for this path.
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });

  it("allows direct Google signin when Turnstile is disabled", async () => {
    delete process.env.TURNSTILE_ENABLED;
    const res = await authPost(makeGoogleSigninRequest(), googleSigninCtx);
    expect(res.status).toBe(200);
  });

  it("rate-limits direct Google signin while Turnstile is disabled", async () => {
    delete process.env.TURNSTILE_ENABLED;
    mockRateLimitCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 60_000 });
    const res = await authPost(makeGoogleSigninRequest(), googleSigninCtx);
    expect(res.status).toBe(429);
  });
});
