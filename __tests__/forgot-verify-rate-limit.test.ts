/**
 * __tests__/forgot-verify-rate-limit.test.ts
 *
 * Verifies that the forgot-password and email-verification endpoints enforce
 * per-IP rate limiting using the same __checkMock pattern as auth-rate-limit.test.ts.
 */

// ── Mocks (hoisted before all imports) ───────────────────────────────────────

jest.mock("@/lib/rate-limit", () => {
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

jest.mock("@/lib/db", () => ({
  db: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

jest.mock("@/lib/email", () => ({
  skipEmailVerification: () => process.env.SKIP_EMAIL_VERIFICATION === "on",
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/base-url", () => ({
  getBaseUrl: () => "http://localhost",
}));

jest.mock("@/lib/request-body", () => ({
  readJsonBody: jest.fn().mockResolvedValue({ email: "victim@example.com" }),
  InvalidJsonBodyError: class InvalidJsonBodyError extends Error {},
  RequestBodyTooLargeError: class RequestBodyTooLargeError extends Error {},
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { POST as forgotPost } from "@/app/api/forgot/route";
import { GET as verifyGet } from "@/app/api/verify/route";
import * as rateLimitModule from "@/lib/rate-limit";
import { db } from "@/lib/db";

const mockCheck = (rateLimitModule as unknown as { __checkMock: jest.Mock }).__checkMock;
const mockDbQuery = (db as unknown as { query: jest.Mock }).query;

// ── Helpers ───────────────────────────────────────────────────────────────────

function forgotRequest(overrides?: { ip?: string }): Request {
  return new Request("http://localhost/api/forgot", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(overrides?.ip ? { "x-forwarded-for": overrides.ip } : {}),
    },
    body: JSON.stringify({ email: "victim@example.com" }),
  });
}

function verifyRequest(overrides?: { ip?: string; token?: string }): Request {
  const token = overrides?.token ?? "abc123";
  return new Request(`http://localhost/api/verify?token=${token}`, {
    method: "GET",
    headers: {
      ...(overrides?.ip ? { "x-forwarded-for": overrides.ip } : {}),
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
  mockDbQuery.mockResolvedValue({ rows: [] });
});

// ── Forgot-password rate limiting ─────────────────────────────────────────────

describe("POST /api/forgot — IP rate limiting", () => {
  it("returns 429 when the per-IP limit is exceeded", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    const res = await forgotPost(forgotRequest({ ip: "1.2.3.4" }));
    expect(res.status).toBe(429);
  });

  it("includes a Retry-After header on 429", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    const res = await forgotPost(forgotRequest());
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("does not call the DB when rate-limited", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    await forgotPost(forgotRequest());
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it("allows the request through when not rate-limited", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });

    const res = await forgotPost(forgotRequest());
    expect(res.status).not.toBe(429);
  });

  it("uses x-real-ip (set by the trusted proxy) when present", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });

    const req = new Request("http://localhost/api/forgot", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-real-ip": "1.1.1.1",
        "x-forwarded-for": "9.9.9.9, 2.2.2.2",
      },
      body: JSON.stringify({ email: "victim@example.com" }),
    });
    await forgotPost(req);
    expect(mockCheck).toHaveBeenCalledWith("1.1.1.1");
  });

  it("uses the rightmost x-forwarded-for value when x-real-ip is absent", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });

    await forgotPost(forgotRequest({ ip: "203.0.113.42, 10.0.0.5" }));
    expect(mockCheck).toHaveBeenCalledWith("10.0.0.5");
  });
});

// ── Email-verification rate limiting ──────────────────────────────────────────

describe("GET /api/verify — IP rate limiting", () => {
  it("returns 429 when the per-IP limit is exceeded", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    const res = await verifyGet(verifyRequest({ ip: "1.2.3.4" }));
    expect(res.status).toBe(429);
  });

  it("includes a Retry-After header on 429", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    const res = await verifyGet(verifyRequest());
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("does not call the DB when rate-limited", async () => {
    mockCheck.mockReturnValueOnce({ limited: true, retryAfterMs: 900_000 });

    await verifyGet(verifyRequest());
    expect(mockDbQuery).not.toHaveBeenCalled();
  });

  it("allows the request through when not rate-limited", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
    // DB returns no user — verify redirects to /?verify=invalid, not 429
    mockDbQuery.mockResolvedValue({ rows: [] });

    const res = await verifyGet(verifyRequest());
    expect(res.status).not.toBe(429);
  });

  it("uses x-real-ip (set by the trusted proxy) when present", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });

    const req = new Request("http://localhost/api/verify?token=tok", {
      method: "GET",
      headers: {
        "x-real-ip": "1.1.1.1",
        "x-forwarded-for": "9.9.9.9, 2.2.2.2",
      },
    });
    await verifyGet(req);
    expect(mockCheck).toHaveBeenCalledWith("1.1.1.1");
  });

  it("uses the rightmost x-forwarded-for value when x-real-ip is absent", async () => {
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });

    await verifyGet(verifyRequest({ ip: "203.0.113.42, 10.0.0.5" }));
    expect(mockCheck).toHaveBeenCalledWith("10.0.0.5");
  });
});
