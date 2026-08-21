/**
 * __tests__/capacity.test.ts
 *
 * Unit and integration tests for the high-traffic capacity features:
 *  - createRateLimiter  (lib/rate-limit.ts)
 *  - rateLimitResponse  (lib/rate-limit.ts)
 *  - createSemaphore    (lib/ai-semaphore.ts)
 *  - Cache-Control headers on leaderboard and XP routes
 */

// ── Mocks (hoisted before all imports by Jest) ────────────────────────────────
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));
jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/db", () => ({
  db: { query: jest.fn() },
  ADMIN_EMAIL: "support@requisor.io",
}));

import { createRateLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { createSemaphore, SemaphoreFullError } from "@/lib/ai-semaphore";
// Route handlers — next-auth and db are already mocked above
import { GET as leaderboardGet } from "@/app/api/leaderboard/route";
import { GET as xpGet } from "@/app/api/xp/route";

// Typed references to the mocked modules
import { getServerSession as nextAuthSession } from "next-auth";
import { getServerSession as nextAuthNextSession } from "next-auth/next";
import { db } from "@/lib/db";

const mockNextAuthSession = nextAuthSession as jest.Mock;
const mockNextAuthNextSession = nextAuthNextSession as jest.Mock;
const mockDbQuery = (db as unknown as { query: jest.Mock }).query;

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiter
// ─────────────────────────────────────────────────────────────────────────────
describe("createRateLimiter", () => {
  it("allows requests within the window limit", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.check("a@test.com").limited).toBe(false);
    expect(limiter.check("a@test.com").limited).toBe(false);
    expect(limiter.check("a@test.com").limited).toBe(false);
  });

  it("blocks the request that exceeds the limit", () => {
    const limiter = createRateLimiter(2, 60_000);
    limiter.check("b@test.com");
    limiter.check("b@test.com");
    const result = limiter.check("b@test.com");
    expect(result.limited).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("returns a positive retryAfterMs when limited", () => {
    const limiter = createRateLimiter(1, 5_000);
    limiter.check("c@test.com");
    const { retryAfterMs } = limiter.check("c@test.com");
    expect(retryAfterMs).toBeGreaterThan(0);
    expect(retryAfterMs).toBeLessThanOrEqual(5_000);
  });

  it("resets after the window expires", () => {
    jest.useFakeTimers();
    const limiter = createRateLimiter(1, 1_000);
    limiter.check("d@test.com");
    expect(limiter.check("d@test.com").limited).toBe(true);
    jest.advanceTimersByTime(1_001);
    expect(limiter.check("d@test.com").limited).toBe(false);
    jest.useRealTimers();
  });

  it("tracks different users independently", () => {
    const limiter = createRateLimiter(1, 60_000);
    limiter.check("alice@test.com");
    expect(limiter.check("alice@test.com").limited).toBe(true);
    // Bob has a fresh slot even though Alice is blocked
    expect(limiter.check("bob@test.com").limited).toBe(false);
  });

  it("does not count the first request in a new window as limited", () => {
    const limiter = createRateLimiter(5, 60_000);
    expect(limiter.check("first@test.com").limited).toBe(false);
  });
});

describe("rateLimitResponse", () => {
  it("returns status 429 as plain text by default", () => {
    const res = rateLimitResponse(30_000);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("returns status 429 as JSON when json option is set", async () => {
    const res = rateLimitResponse(5_500, { json: true });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("6"); // ceil(5500/1000)
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rounds up retryAfterMs to whole seconds in the Retry-After header", () => {
    const res = rateLimitResponse(1_001);
    expect(res.headers.get("Retry-After")).toBe("2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Semaphore
// ─────────────────────────────────────────────────────────────────────────────
describe("createSemaphore", () => {
  it("runs tasks within the concurrency limit simultaneously", async () => {
    const sem = createSemaphore(2);
    let concurrent = 0;
    let peak = 0;
    const task = () =>
      new Promise<void>((r) => {
        concurrent++;
        peak = Math.max(peak, concurrent);
        setImmediate(() => {
          concurrent--;
          r();
        });
      });
    await Promise.all([sem.withConcurrency(task), sem.withConcurrency(task)]);
    expect(peak).toBe(2);
  });

  it("queues tasks that exceed the concurrency limit", async () => {
    const sem = createSemaphore(1);
    const order: number[] = [];
    const makeTask = (n: number) => () =>
      new Promise<void>((r) =>
        setImmediate(() => {
          order.push(n);
          r();
        })
      );
    await Promise.all([sem.withConcurrency(makeTask(1)), sem.withConcurrency(makeTask(2))]);
    expect(order).toEqual([1, 2]);
  });

  it("throws SemaphoreFullError when the queue is at capacity", async () => {
    const sem = createSemaphore(1, 0); // limit=1, maxQueue=0
    let resolveFirst!: () => void;
    const firstDone = new Promise<void>((r) => {
      resolveFirst = r;
    });
    const firstTask = sem.withConcurrency(() => firstDone);
    // Second task should be rejected immediately (queue full)
    await expect(sem.withConcurrency(() => Promise.resolve())).rejects.toBeInstanceOf(
      SemaphoreFullError
    );
    resolveFirst();
    await firstTask;
  });

  it("resumes a queued task after a slot frees", async () => {
    const sem = createSemaphore(1, 10);
    let secondRan = false;
    let resolveFirst!: () => void;
    const firstDone = new Promise<void>((r) => {
      resolveFirst = r;
    });
    const firstTask = sem.withConcurrency(() => firstDone);
    const secondTask = sem.withConcurrency(async () => {
      secondRan = true;
    });
    // Second task cannot run while first holds the slot
    expect(secondRan).toBe(false);
    resolveFirst();
    await Promise.all([firstTask, secondTask]);
    expect(secondRan).toBe(true);
  });

  it("releases the slot even when the task throws", async () => {
    const sem = createSemaphore(1);
    await expect(
      sem.withConcurrency(() => Promise.reject(new Error("task failed")))
    ).rejects.toThrow("task failed");
    // Slot should be free again — a subsequent task must not hang
    await expect(sem.withConcurrency(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});

describe("createSemaphore — acquire/release (streaming pattern)", () => {
  it("acquire() returns a release function that frees the slot", async () => {
    const sem = createSemaphore(1);
    const rel = await sem.acquire();
    expect(sem._state().running).toBe(1);
    rel();
    expect(sem._state().running).toBe(0);
  });

  it("acquire() blocks when limit is reached, unblocks after release", async () => {
    const sem = createSemaphore(1);
    const rel1 = await sem.acquire();
    expect(sem._state().running).toBe(1);

    let rel2Resolved = false;
    const pending = sem.acquire().then((rel) => {
      rel2Resolved = true;
      return rel;
    });

    // Slot is full — second acquire has not resolved yet
    await new Promise((r) => setImmediate(r));
    expect(rel2Resolved).toBe(false);

    // Release first slot — second acquire should now resolve
    rel1();
    const rel2 = await pending;
    expect(rel2Resolved).toBe(true);
    rel2();
    expect(sem._state().running).toBe(0);
  });

  it("acquire() throws SemaphoreFullError when queue is at capacity", async () => {
    const sem = createSemaphore(1, 0); // no queue slots
    const rel = await sem.acquire();
    await expect(sem.acquire()).rejects.toBeInstanceOf(SemaphoreFullError);
    rel();
  });

  it("release() wakes a queued acquire() caller", async () => {
    const sem = createSemaphore(1, 5);
    const rel1 = await sem.acquire();
    const pending = sem.acquire();
    rel1(); // wake the queued acquire
    const rel2 = await pending;
    expect(sem._state().running).toBe(1);
    rel2();
    expect(sem._state().running).toBe(0);
  });
});

describe("upstream timeout — semaphore slot released on abort", () => {
  it("releases the slot when the fn throws (simulating a timed-out fetch)", async () => {
    const sem = createSemaphore(1);
    // Simulate what happens when fetch throws after AbortController.abort()
    const abortErr = new DOMException("The operation was aborted.", "AbortError");
    await expect(
      sem.withConcurrency(() => Promise.reject(abortErr))
    ).rejects.toMatchObject({ name: "AbortError" });
    // Slot is free — next caller must not queue or hang
    expect(sem._state().running).toBe(0);
    await expect(sem.withConcurrency(() => Promise.resolve("recovered"))).resolves.toBe("recovered");
  });

  it("releases the slot when acquire() result is used and then released after an abort path", async () => {
    const sem = createSemaphore(1);
    const rel = await sem.acquire();
    expect(sem._state().running).toBe(1);
    // Simulate a streaming route that aborts — release is always called in finally
    try {
      throw new DOMException("The operation was aborted.", "AbortError");
    } catch {
      rel(); // finally block equivalent
    }
    expect(sem._state().running).toBe(0);
  });

  it("MAX_QUEUE=0 makes the second concurrent request fail immediately", async () => {
    const sem = createSemaphore(1, 0); // no queue
    const rel = await sem.acquire();
    await expect(sem.withConcurrency(() => Promise.resolve())).rejects.toBeInstanceOf(
      SemaphoreFullError
    );
    rel();
    expect(sem._state().running).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache-Control headers
// ─────────────────────────────────────────────────────────────────────────────
describe("leaderboard GET Cache-Control", () => {
  it("includes a private Cache-Control header", async () => {
    mockNextAuthSession.mockResolvedValue({ user: { id: "1", email: "test@example.com" } });
    // First query returns caller in top-10 (so second fallback query is skipped)
    mockDbQuery
      .mockResolvedValueOnce({ rows: [{ id: 1, display_name: "Tester", xp: 100, rank: "1" }] })
      .mockResolvedValueOnce({ rows: [{ total: "1" }] });

    const res = await leaderboardGet();
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("private");
    expect(cc).toMatch(/max-age=\d+/);
  });

  it("does not expose Cache-Control on 401 responses", async () => {
    mockNextAuthSession.mockResolvedValue(null);
    const res = await leaderboardGet();
    expect(res.status).toBe(401);
    // Unauthenticated responses should not carry a positive cache directive
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).not.toMatch(/max-age=[1-9]/);
  });
});

describe("XP GET Cache-Control", () => {
  it("includes a private Cache-Control header", async () => {
    mockNextAuthNextSession.mockResolvedValue({
      user: { id: "1", email: "test@example.com" },
    });
    mockDbQuery.mockResolvedValue({ rows: [{ xp: 50 }] });

    const res = await xpGet();
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("private");
    expect(cc).toMatch(/max-age=\d+/);
  });
});
