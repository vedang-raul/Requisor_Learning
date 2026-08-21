/**
 * lib/ai-semaphore.ts
 *
 * Promise-based concurrency semaphore for upstream xAI API calls.
 *
 * Caps simultaneous outgoing requests so a lecture-end spike (hundreds of
 * students triggering quiz/chat at once) cannot fan out unbounded against
 * xAI's quota.  Excess requests queue behind the semaphore and are served
 * as slots free.  When the queue itself is full the caller receives a
 * SemaphoreFullError and should surface a 503.
 *
 * Two call patterns are supported:
 *   withConcurrency(fn)  – acquires, awaits fn(), releases.  Correct for
 *                          non-streaming routes (quiz, assignment, etc.).
 *   acquireAiSlot()      – returns a `release()` function so the caller can
 *                          hold the slot across an async boundary (e.g. the
 *                          full lifetime of a streaming response).
 *
 * Configurable via:
 *   AI_CONCURRENCY_LIMIT     – max concurrent xAI calls (default 20)
 *   AI_CONCURRENCY_MAX_QUEUE – max requests allowed to queue (default 200; 0 disables queuing)
 *   AI_UPSTREAM_TIMEOUT_MS   – deadline for non-streaming xAI fetches (default 30 000 ms)
 */

const CONCURRENCY_LIMIT = Math.max(
  1,
  Number(process.env.AI_CONCURRENCY_LIMIT) || 20
);

// Fix: `|| 200` treats "0" as falsy and wrongly falls back to 200.
// Use explicit undefined-check so zero is a valid value.
const MAX_QUEUE =
  process.env.AI_CONCURRENCY_MAX_QUEUE !== undefined &&
  process.env.AI_CONCURRENCY_MAX_QUEUE !== ""
    ? Math.max(0, Number(process.env.AI_CONCURRENCY_MAX_QUEUE))
    : 200;

/**
 * Upstream deadline for non-streaming xAI calls.
 * Each route must create an AbortController with this budget so a hung
 * upstream cannot retain a semaphore slot indefinitely.
 */
export const AI_UPSTREAM_TIMEOUT_MS =
  Number(process.env.AI_UPSTREAM_TIMEOUT_MS) || 30_000;

export class SemaphoreFullError extends Error {
  constructor() {
    super("AI service is overloaded. Please try again in a moment.");
    this.name = "SemaphoreFullError";
  }
}

/**
 * Create an isolated semaphore.  Production code uses the module-level
 * singleton; tests call this directly to control the limit.
 */
export function createSemaphore(limit: number, maxQueue = 200) {
  let running = 0;
  const queue: Array<() => void> = [];

  /** Release one slot and wake the next queued waiter, if any. */
  function release() {
    running--;
    const next = queue.shift();
    if (next) {
      running++;
      next(); // next() is a plain resolve() — no running++ inside
    }
  }

  /**
   * Acquire one slot.  Resolves immediately when a slot is available,
   * otherwise queues until one frees.  Returns the `release` function so
   * the caller can hold the slot across async boundaries (streaming).
   */
  async function acquire(): Promise<typeof release> {
    if (running < limit) {
      running++;
      return release;
    }
    if (queue.length >= maxQueue) throw new SemaphoreFullError();
    // Park until release() wakes us.  release() does running++ *before*
    // calling resolve, so running is already 1 when the await resumes here.
    await new Promise<void>((resolve) => {
      queue.push(resolve); // plain resolve — release() does the running++ 
    });
    return release;
  }

  /** Convenience wrapper: acquire → fn() → release, even on throw. */
  async function withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
    const rel = await acquire();
    try {
      return await fn();
    } finally {
      rel();
    }
  }

  /** Exposed for testing only. */
  function _state() {
    return { running, queueLength: queue.length };
  }

  return { acquire, withConcurrency, _state };
}

// ── Singleton shared by all AI routes ────────────────────────────────────────
const _singleton = createSemaphore(CONCURRENCY_LIMIT, MAX_QUEUE);

/** For non-streaming routes: wraps fn() and releases automatically. */
export const withAiConcurrency = _singleton.withConcurrency;

/**
 * For streaming routes (chat): acquire a slot and receive a `release()`
 * function.  The caller MUST call release() when the stream ends, even on
 * error, so the slot is returned to the pool.
 */
export const acquireAiSlot = _singleton.acquire;
