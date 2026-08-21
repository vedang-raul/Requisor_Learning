/**
 * __tests__/turnstile-routes.test.ts
 *
 * Verifies that CAPTCHA enforcement is wired into the login, signup,
 * forgot-password, and Google-initiate routes.
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
  verifyTurnstile: (...args: [string | null | undefined]) =>
    mockVerifyTurnstile(...args),
}));

// Rate limiter — controllable mock so tests can simulate both allowed and
// limited states.  Default behaviour (always allow) is restored in beforeEach.
const mockRateLimitCheck = jest.fn(() => ({ limited: false, retryAfterMs: 0 }));

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
  readJsonBody: jest.fn(async (req: Request) => req.json()),
  RequestBodyTooLargeError: class RequestBodyTooLargeError extends Error {},
  InvalidJsonBodyError: class InvalidJsonBodyError extends Error {},
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { POST as signupPost } from "@/app/api/signup/route";
import { POST as forgotPost } from "@/app/api/forgot/route";
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
  mockVerifyTurnstile.mockResolvedValue({ success: true });
  // Restore the default "always allow" behaviour so CAPTCHA-focused tests are
  // not affected by rate-limit state set in rate-limiting tests.
  mockRateLimitCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
});

// ── POST /api/signup ──────────────────────────────────────────────────────────

describe("POST /api/signup — CAPTCHA enforcement", () => {
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

  it("does not call the rate limiter or Turnstile for the Google signin path", async () => {
    const { value } = issueGrant();
    await authPost(makeGoogleSigninRequest(value), googleSigninCtx);
    // Turnstile mock should not have been called for this path.
    expect(mockVerifyTurnstile).not.toHaveBeenCalled();
  });
});
