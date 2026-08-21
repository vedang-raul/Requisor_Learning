/**
 * __tests__/auth-rate-limit.test.ts
 *
 * Verifies that the login and signup endpoints enforce per-IP rate limiting.
 *
 * Both routes use the shared createRateLimiter factory from lib/rate-limit.
 * The mock exposes a controllable `check` function via `__checkMock` so
 * individual tests can simulate limited vs. allowed states without exhausting
 * a real counter.
 */

// ── Mocks (hoisted before all imports) ───────────────────────────────────────

jest.mock("@/lib/rate-limit", () => {
  // Factory-internal reference avoids the const-hoisting pitfall.
  const checkMock = jest.fn(() => ({ limited: false, retryAfterMs: 0 }));
  return {
    __checkMock: checkMock,
    createRateLimiter: () => ({ check: checkMock }),
    rateLimitResponse: (_ms: number, opts?: { json?: boolean }) => {
      const body = JSON.stringify({ error: "Too many requests. Please wait a moment before trying again." });
      return new Response(body, {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "900",
        },
      });
    },
  };
});

// Turnstile mock — dev bypass returns success so rate-limit tests are unaffected.
jest.mock("@/lib/turnstile", () => ({
  verifyTurnstile: jest.fn().mockResolvedValue({ success: true }),
}));

// NextAuth mock — returns a stub handler that always succeeds.
jest.mock("next-auth", () => {
  const handlerFn = jest.fn(async () => new Response("OK", { status: 200 }));
  const NextAuth = jest.fn(() => handlerFn);
  (NextAuth as unknown as Record<string, unknown>).__handler = handlerFn;
  return NextAuth;
});

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/db", () => ({
  db: { query: jest.fn() },
  roleForEmail: jest.fn(() => "employee"),
}));

jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { POST as signupPost } from "@/app/api/signup/route";
import { POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import NextAuth from "next-auth";
import * as rateLimitModule from "@/lib/rate-limit";
import { db } from "@/lib/db";

const mockCheck = (rateLimitModule as unknown as { __checkMock: jest.Mock }).__checkMock;
const mockNextAuthHandler = (NextAuth as unknown as { __handler: jest.Mock }).__handler;
const mockDbQuery = (db as unknown as { query: jest.Mock }).query;

// ── Helpers ───────────────────────────────────────────────────────────────────

function signupRequest(overrides?: { ip?: string; body?: Record<string, unknown> }): Request {
  const body = overrides?.body ?? {
    name: "Alice",
    email: "alice@example.com",
    password: "securepassword",
    employmentType: "intern",
  };
  return new Request("http://localhost/api/signup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(overrides?.ip ? { "x-forwarded-for": overrides.ip } : {}),
    },
    body: JSON.stringify(body),
  });
}

function authCallbackRequest(ip?: string): Request {
  return new Request("http://localhost/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ip ? { "x-forwarded-for": ip } : {}),
    },
    body: JSON.stringify({ csrfToken: "tok", email: "a@b.com", password: "pass" }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
});

// ── Signup rate limiting ──────────────────────────────────────────────────────

describe("POST /api/signup — IP rate limiting", () => {
  it("returns 429 when the per-IP limit is exceeded", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    const res = await signupPost(signupRequest({ ip: "1.2.3.4" }));
    expect(res.status).toBe(429);
  });

  it("includes Retry-After header on 429", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    const res = await signupPost(signupRequest());
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("does not call the DB when rate-limited", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    await signupPost(signupRequest());
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it("allows the request through when not rate-limited", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
    // Return 'no existing user' so the INSERT path is taken
    mockDbQuery.mockResolvedValue({ rows: [] });

    const res = await signupPost(signupRequest());
    // Could be 200 (registered) or a DB error — either way it got past the rate limiter
    expect(res.status).not.toBe(429);
  });

  it("uses x-real-ip (set by the trusted proxy) when present", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
    mockDbQuery.mockResolvedValue({ rows: [] });

    const req = new Request("http://localhost/api/signup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // x-real-ip is the Replit-proxy-controlled header — must win
        "x-real-ip": "1.1.1.1",
        // even if x-forwarded-for contains a different client-injected value
        "x-forwarded-for": "9.9.9.9, 2.2.2.2",
      },
      body: JSON.stringify({ name: "A", email: "a@b.com", password: "pass1234", employmentType: "intern" }),
    });
    await signupPost(req);
    expect(mockCheck).toHaveBeenCalledWith("1.1.1.1");
  });

  it("uses the RIGHTMOST x-forwarded-for value (added by trusted proxy, not client)", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
    mockDbQuery.mockResolvedValue({ rows: [] });

    // "203.0.113.42" is a client-injected spoof; "10.0.0.5" is appended by Replit's proxy
    await signupPost(signupRequest({ ip: "203.0.113.42, 10.0.0.5" }));

    expect(mockCheck).toHaveBeenCalledWith("10.0.0.5");
  });
});

// ── Login rate limiting ───────────────────────────────────────────────────────

describe("POST /api/auth/callback/credentials — IP rate limiting", () => {
  it("returns 429 when the per-IP limit is exceeded", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    const res = await authPost(authCallbackRequest("5.6.7.8"), {
      params: Promise.resolve({ nextauth: ["callback", "credentials"] }),
    });
    expect(res.status).toBe(429);
  });

  it("does not call the NextAuth handler when rate-limited", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    await authPost(authCallbackRequest(), {
      params: Promise.resolve({ nextauth: ["callback", "credentials"] }),
    });
    expect(mockNextAuthHandler).not.toHaveBeenCalled();
  });

  it("passes the request to NextAuth when not rate-limited", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });

    const res = await authPost(authCallbackRequest(), {
      params: Promise.resolve({ nextauth: ["callback", "credentials"] }),
    });
    expect(mockNextAuthHandler).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

// ── Non-credentials NextAuth paths are not rate-limited ──────────────────────

describe("POST /api/auth/signout — not rate-limited", () => {
  it("passes signout requests to NextAuth without checking the rate limiter", async () => {
    const req = new Request("http://localhost/api/auth/signout", { method: "POST" });

    await authPost(req, { params: Promise.resolve({ nextauth: ["signout"] }) });

    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockNextAuthHandler).toHaveBeenCalled();
  });
});
