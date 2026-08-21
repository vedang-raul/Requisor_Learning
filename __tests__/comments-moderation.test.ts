/**
 * __tests__/comments-moderation.test.ts
 *
 * Tests that POST /api/comments enforces per-user rate limiting and routes
 * AI moderation calls through the global xAI semaphore.
 */

// ── Mocks (hoisted before all imports) ───────────────────────────────────────

// Expose a controllable `check` mock via a custom property on the mock module.
// Using a factory-internal reference avoids the hoisting pitfall with `const`.
jest.mock("@/lib/rate-limit", () => {
  const checkMock = jest.fn(() => ({ limited: false, retryAfterMs: 0 }));
  return {
    __checkMock: checkMock,
    createRateLimiter: () => ({ check: checkMock }),
    rateLimitResponse: (_ms: number, opts?: { json?: boolean }) => {
      const body = JSON.stringify({ error: "Too many requests. Please wait a moment before trying again." });
      return new Response(body, {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    },
  };
});

jest.mock("@/lib/ai-semaphore", () => {
  const withConcurrencyMock = jest.fn((fn: () => Promise<unknown>) => fn());
  return {
    __withConcurrencyMock: withConcurrencyMock,
    withAiConcurrency: withConcurrencyMock,
    SemaphoreFullError: class SemaphoreFullError extends Error {
      constructor() {
        super("overloaded");
        this.name = "SemaphoreFullError";
      }
    },
  };
});

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({ db: { query: jest.fn() } }));
jest.mock("@/lib/data", () => ({ seedCourses: [] }));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { POST } from "@/app/api/comments/route";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import * as rateLimitModule from "@/lib/rate-limit";
import * as semaphoreModule from "@/lib/ai-semaphore";

const mockGetSession = getServerSession as jest.Mock;
const mockDbQuery = (db as unknown as { query: jest.Mock }).query;
const mockCheck = (rateLimitModule as unknown as { __checkMock: jest.Mock }).__checkMock;
const mockWithConcurrency = (semaphoreModule as unknown as { __withConcurrencyMock: jest.Mock }).__withConcurrencyMock;

// ── Helpers ───────────────────────────────────────────────────────────────────

const AUTHED_SESSION = {
  user: { id: "1", email: "learner@example.com", name: "Learner" },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Simulate xAI responding that a comment IS relevant. */
function xaiRelevant() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: '{"relevant":true}' } }] }),
  }) as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
  process.env.XAI_API_KEY = "test-xai-key";
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe("POST /api/comments — rate limiting", () => {
  it("returns 429 when the per-user limit is exceeded", async () => {
    mockGetSession.mockResolvedValue(AUTHED_SESSION);
    mockCheck.mockReturnValue({ limited: true, retryAfterMs: 30_000 });

    const res = await POST(makeRequest({ lessonId: "l1", body: "Hello" }) as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(429);
  });

  it("does not call the DB or AI when rate-limited", async () => {
    mockGetSession.mockResolvedValue(AUTHED_SESSION);
    mockCheck.mockReturnValue({ limited: true, retryAfterMs: 30_000 });

    await POST(makeRequest({ lessonId: "l1", body: "Hello" }) as unknown as import("next/server").NextRequest);

    expect(mockDbQuery).not.toHaveBeenCalled();
    // The semaphore wrapper (withAiConcurrency) should not have been called,
    // meaning no AI moderation fetch was attempted.
    expect(mockWithConcurrency).not.toHaveBeenCalled();
  });

  it("allows the request through when not rate-limited", async () => {
    mockGetSession.mockResolvedValue(AUTHED_SESSION);
    mockCheck.mockReturnValue({ limited: false, retryAfterMs: 0 });
    xaiRelevant();
    mockDbQuery.mockResolvedValue({
      rows: [{ id: 1, user_name: "Learner", body: "Hello", created_at: new Date().toISOString() }],
    });

    const res = await POST(makeRequest({ lessonId: "l1", body: "What is machine learning?" }) as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
  });
});

// ── AI semaphore ──────────────────────────────────────────────────────────────

describe("POST /api/comments — AI moderation semaphore", () => {
  it("routes the moderation fetch through withAiConcurrency", async () => {
    mockGetSession.mockResolvedValue(AUTHED_SESSION);
    xaiRelevant();
    mockDbQuery.mockResolvedValue({
      rows: [{ id: 1, user_name: "Learner", body: "test", created_at: new Date().toISOString() }],
    });

    await POST(makeRequest({ lessonId: "l1", body: "Can you explain overfitting?" }) as unknown as import("next/server").NextRequest);

    expect(mockWithConcurrency).toHaveBeenCalledTimes(1);
  });

  it("fails open (allows comment) when the semaphore is full", async () => {
    mockGetSession.mockResolvedValue(AUTHED_SESSION);
    const { SemaphoreFullError } = semaphoreModule;
    // Semaphore throws when overloaded
    mockWithConcurrency.mockRejectedValueOnce(new SemaphoreFullError());
    mockDbQuery.mockResolvedValue({
      rows: [{ id: 2, user_name: "Learner", body: "test", created_at: new Date().toISOString() }],
    });

    // Comment should still be accepted even though moderation was skipped
    const res = await POST(makeRequest({ lessonId: "l1", body: "Great lesson!" }) as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
  });

  it("returns 401 when session is missing", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await POST(makeRequest({ lessonId: "l1", body: "test" }) as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });
});
