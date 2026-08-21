# Load & Capacity Reference

This document records the per-route limits and upgrade paths introduced for university-scale deployments (thousands of simultaneous users).

---

## Database connection pool

| Setting | Value | Why |
|---|---|---|
| `max` connections | 20 | Raised from 5; headroom for burst traffic without exhausting Replit Postgres |
| `idleTimeoutMillis` | 30 000 ms | Evicts idle connections; prevents server-side "too many clients" under variable load |
| `connectionTimeoutMillis` | 3 000 ms | Fails fast on pool exhaustion instead of hanging indefinitely |
| `statement_timeout` | 8 000 ms | Kills long-running queries that would otherwise hold pool slots |

**Upgrade path:** If connection saturation appears in logs (`connection timeout`), deploy PgBouncer in transaction-pooling mode in front of Postgres and set `max` here to PgBouncer's pool size.

---

## AI route rate limits (per user, per minute)

All limits are enforced in-process with a sliding-window counter.  Limits reset on server restart — acceptable for a single-instance deployment.

| Route | Limit | Window | Rationale |
|---|---|---|---|
| `POST /api/chat` | 20 req | 60 s | Interactive assistant; high frequency expected |
| `POST /api/quiz` | 10 req | 60 s | One quiz per lesson; 10 is a generous ceiling |
| `POST /api/assignment` | 10 req | 60 s | One assignment per lesson |
| `POST /api/course-assessment` | 5 req | 60 s | End-of-course capstone; rarely triggered twice |
| `POST /api/team-insights` | 10 req | 60 s | Admin-only; additional account-level protection |

All rate-limited routes return **HTTP 429** with a `Retry-After: N` header (seconds until the window resets).

**Upgrade path:** Replace the in-process `Map` in `lib/rate-limit.ts` with a Redis-backed sliding window (e.g. ioredis + a Lua `EVALSHA` script).  No call-site changes required — only the `createRateLimiter` implementation changes.

---

## Global AI concurrency semaphore

A single process-level semaphore caps the total number of simultaneous outgoing xAI API calls across all routes.

| Setting | Default | Env var override |
|---|---|---|
| Max concurrent calls | 20 | `AI_CONCURRENCY_LIMIT` |
| Max queue depth | 200 | `AI_CONCURRENCY_MAX_QUEUE` |

When the queue is full, the route returns **HTTP 503** with a human-readable message.  Requests that fit in the queue wait until a slot opens; typical xAI latency is 1–5 s so the queue drains quickly under normal load.

For chat (streaming), the semaphore slot is acquired **before** the `ReadableStream` is created and held until the stream's `finally` block runs — i.e. for the entire stream lifetime from connection open to the last byte sent (or client disconnect / timeout).  This means at most `AI_CONCURRENCY_LIMIT` xAI streams are active at any one time, not just being initiated.

The slot is released via an explicit `release()` function returned by `acquireAiSlot()` and called inside the stream's `finally` block, ensuring it is always returned even on error or disconnect.

### Upstream timeouts

Every non-streaming xAI call (quiz, assignment, course-assessment, team-insights, comment moderation) wraps its `fetch()` in an `AbortController` with a `AI_UPSTREAM_TIMEOUT_MS` deadline (default 30 000 ms).  The `clearTimeout` is in a `finally` block so the timer is always cancelled whether the fetch succeeds, fails, or times out.  If xAI hangs, the `AbortError` propagates out of `withAiConcurrency`, which releases the semaphore slot in its own `finally` block — preventing slot exhaustion from a degraded upstream.

Chat's 30-second deadline is enforced by the shared `timeoutController` (combined client-disconnect + timeout signal) and cleared in the stream's `finally`.

Configurable via env:

| Variable | Default | Notes |
|---|---|---|
| `AI_CONCURRENCY_LIMIT` | 20 | Max concurrent xAI calls |
| `AI_CONCURRENCY_MAX_QUEUE` | 200 | Max queued requests (0 = no queue; empty = default) |
| `AI_UPSTREAM_TIMEOUT_MS` | 30 000 | Deadline per non-streaming xAI call |

---

## HTTP cache headers

| Route | `Cache-Control` value | Staleness tolerance |
|---|---|---|
| `GET /api/leaderboard` | `private, max-age=30, stale-while-revalidate=60` | Rankings update only when XP is awarded |
| `GET /api/xp` | `private, max-age=10, stale-while-revalidate=30` | Personal XP; short TTL to stay nearly current |

All cached responses are marked `private` — they contain user-specific data (`isSelf`, personal XP) and must not be stored by a shared proxy or CDN.

---

## Manual load-test checklist

Run these checks against a staging instance before a university cohort launch:

1. **Pool exhaustion:** Send 25 concurrent authenticated requests to `GET /api/leaderboard`.  All should return 200 within the `connectionTimeoutMillis` window (3 s).  No request should hang indefinitely.

2. **Rate limiting:** Send 15 quiz requests in rapid succession for the same user.  Requests 11–15 should return 429 with a `Retry-After` header.

3. **Semaphore queuing:** Send 25 simultaneous `POST /api/quiz` requests.  All 25 should eventually succeed (or receive 429 from the per-user limiter, not 503 from the semaphore) because the queue depth is 200.

4. **Cache headers:** `curl -I /api/leaderboard` and verify `Cache-Control: private, max-age=30` is present.

5. **Statement timeout:** Run a deliberately slow query via `pg_sleep` through a test endpoint and confirm it is killed after 8 s and the pool slot is released.
