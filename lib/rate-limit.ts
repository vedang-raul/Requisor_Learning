/**
 * lib/rate-limit.ts
 *
 * In-process fixed-window rate limiter shared by all AI-backed routes.
 *
 * The window is anchored on each user's first request: the counter resets
 * when the next request arrives after the window has elapsed.  This is a
 * fixed-window (not sliding-window) design — a burst straddling a boundary
 * can briefly exceed the per-minute limit by up to 2× max, which is
 * acceptable for an internal LMS.
 *
 * Each route creates its own limiter via createRateLimiter() so limits are
 * tracked independently per route.  All state is process-local and resets on
 * restart — intentional for a single-instance deployment.
 *
 * Redis upgrade path: replace the Map store with a Lua EVALSHA script against
 * ioredis (INCR + EXPIRE pattern) without touching call-site code.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /**
   * Check and consume one request for the given key (typically user email).
   * Returns { limited: true, retryAfterMs } when the limit is exceeded, or
   * { limited: false, retryAfterMs: 0 } when the request is allowed.
   */
  check(key: string): { limited: boolean; retryAfterMs: number };
}

/**
 * Create a per-route rate limiter.
 *
 * @param max       Maximum requests allowed per window.
 * @param windowMs  Window duration in milliseconds.
 */
export function createRateLimiter(max: number, windowMs: number): RateLimiter {
  const store = new Map<string, RateLimitEntry>();

  return {
    check(key: string) {
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now >= entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { limited: false, retryAfterMs: 0 };
      }

      if (entry.count >= max) {
        return { limited: true, retryAfterMs: entry.resetAt - now };
      }

      entry.count += 1;
      return { limited: false, retryAfterMs: 0 };
    },
  };
}

/**
 * Standard 429 response helper — keeps the response format consistent across
 * all routes regardless of whether they normally return JSON or plain text.
 */
export function rateLimitResponse(
  retryAfterMs: number,
  opts: { json?: boolean } = {}
): Response {
  const retryAfter = String(Math.ceil(retryAfterMs / 1000));
  const message = "Too many requests. Please wait a moment before trying again.";

  if (opts.json) {
    return Response.json(
      { error: message },
      { status: 429, headers: { "Retry-After": retryAfter } }
    );
  }

  return new Response(message, {
    status: 429,
    headers: {
      "Retry-After": retryAfter,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
