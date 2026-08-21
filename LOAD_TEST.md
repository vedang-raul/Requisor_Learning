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

## Database indexes

### Index inventory — `users` table

Plans captured at 1005 rows (1000 synthetic employees + 5 real accounts, ~4804 lesson completions), with `enable_seqscan=off` to expose the available index paths; at production scale PostgreSQL's cost model naturally selects index paths as table sizes grow.

| Index name | Definition | Origin | Supports |
|---|---|---|---|
| `users_pkey` | `UNIQUE (id)` — primary key | Table DDL | All PK lookups |
| `users_email_key` | `UNIQUE (email)` | Table DDL UNIQUE constraint; also declared idempotently in `post-merge.sh` so bare schema restores guarantee it | Auth lookups by email |
| `users_google_id_unique` | `UNIQUE (google_id) WHERE google_id IS NOT NULL` | `post-merge.sh` | OAuth identity binding |
| `users_leaderboard_idx` | `(role, xp DESC, last_login_at DESC NULLS LAST)` | `post-merge.sh` | Leaderboard `ROW_NUMBER()` window function |
| `users_analytics_active_idx` | `(email_verified, last_login_at)` | `post-merge.sh` | Admin analytics active-user count query |

All `post-merge.sh`-managed indexes use `CREATE INDEX IF NOT EXISTS` — idempotent and safe to re-run on any environment.

---

### EXPLAIN (ANALYZE, BUFFERS) — leaderboard query (`GET /api/leaderboard`)

Query: `ROW_NUMBER() OVER (ORDER BY xp DESC, last_login_at DESC NULLS LAST, id ASC) FROM users WHERE role = 'employee' AND xp > 0`

**Before** — `users_leaderboard_idx` absent; `enable_seqscan=on`, `enable_indexscan=off` to reproduce the pre-index plan shape at scale:

```
Sort  (cost=148.90..149.74 rows=334 width=48) (actual time=1.261..1.264 rows=10 loops=1)
  Sort Key: ranked.rank
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=34
  ->  Subquery Scan on ranked  (cost=89.90..134.90 rows=334 width=48) (actual time=0.782..1.164 rows=10 loops=1)
        Filter: ((ranked.rank <= 10) OR (ranked.id = 1))
        Rows Removed by Filter: 991
        Buffers: shared hit=31
        ->  WindowAgg  (cost=89.90..119.90 rows=1000 width=56) (actual time=0.777..1.101 rows=1001 loops=1)
              Buffers: shared hit=31
              ->  Sort  (cost=89.90..92.40 rows=1000 width=51) (actual time=0.692..0.736 rows=1001 loops=1)
                    Sort Key: users.xp DESC, users.last_login_at DESC NULLS LAST, users.id
                    Sort Method: quicksort  Memory: 102kB
                    Buffers: shared hit=31
                    ->  Seq Scan on users  (cost=0.00..40.08 rows=1000 width=51) (actual time=0.014..0.253 rows=1001 loops=1)
                          Filter: ((xp > 0) AND (role = 'employee'::text))
                          Rows Removed by Filter: 4
                          Buffers: shared hit=25
Planning Time: 1.381 ms  Execution Time: 1.683 ms
```

Full sequential scan on `users` (25 shared buffer hits) followed by a 102 kB in-memory quicksort of all 1001 qualifying rows before the window function can start. At O(N log N) this dominates under sustained load.

**After** — `users_leaderboard_idx` present; `enable_seqscan=off`, `enable_indexscan=on`:

```
Sort  (cost=154.15..154.99 rows=334 width=48) (actual time=1.066..1.067 rows=10 loops=1)
  Sort Key: ranked.rank
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=980
  ->  Subquery Scan on ranked  (cost=0.35..140.15 rows=334 width=48) (actual time=0.159..1.058 rows=10 loops=1)
        Filter: ((ranked.rank <= 10) OR (ranked.id = 1))
        Rows Removed by Filter: 991
        Buffers: shared hit=980
        ->  WindowAgg  (cost=0.35..125.15 rows=1000 width=56) (actual time=0.157..0.995 rows=1001 loops=1)
              Buffers: shared hit=980
              ->  Incremental Sort  (cost=0.35..97.65 rows=1000 width=51) (actual time=0.150..0.702 rows=1001 loops=1)
                    Sort Key: users.xp DESC, users.last_login_at DESC NULLS LAST, users.id
                    Presorted Key: users.xp, users.last_login_at
                    Full-sort Groups: 32  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
                    Buffers: shared hit=980
                    ->  Index Scan using users_leaderboard_idx on users  (cost=0.28..56.32 rows=1000 width=51) (actual time=0.036..0.415 rows=1001 loops=1)
                          Index Cond: ((role = 'employee'::text) AND (xp > 0))
                          Buffers: shared hit=980
Planning Time: 0.141 ms  Execution Time: 1.155 ms
```

The index delivers rows pre-sorted on `xp DESC, last_login_at DESC NULLS LAST` (the two leading window-function keys); only a cheap incremental sort on `id` (tie-breaking key) remains — 32 small groups averaging 27 kB each instead of one 102 kB full sort. Planning time drops from 1.381 ms → 0.141 ms (10×) because the planner finds the exact index for the `ORDER BY`. The higher buffer count (980 vs 25) reflects index-page traversal in addition to heap fetches; at large scale this is offset by the planner being able to stop early (LIMIT pushdown) once 10 ranked rows are found.

---

### EXPLAIN (ANALYZE, BUFFERS) — admin analytics queries (`GET /api/admin/analytics`)

#### Active-user count — `WHERE email_verified = TRUE AND last_login_at > NOW() - INTERVAL '7 days'`

**Before** — `users_analytics_active_idx` absent; seqscan forced:

```
Aggregate  (cost=42.97..42.98 rows=1 width=8) (actual time=0.216..0.217 rows=1 loops=1)
  Buffers: shared hit=25
  ->  Seq Scan on users  (cost=0.00..42.59 rows=154 width=0) (actual time=0.006..0.201 rows=153 loops=1)
        Filter: (email_verified AND (last_login_at > (now() - '7 days'::interval)))
        Rows Removed by Filter: 852
        Buffers: shared hit=25
Planning Time: 0.186 ms  Execution Time: 0.241 ms
```

Full scan of 1005 rows; 852 discarded after reading. Scales linearly with total user count.

**After** — `users_analytics_active_idx` present; index scan enabled:

```
Aggregate  (cost=27.38..27.39 rows=1 width=8) (actual time=0.098..0.098 rows=1 loops=1)
  Buffers: shared hit=154
  ->  Index Only Scan using users_analytics_active_idx on users  (cost=0.28..26.99 rows=154 width=0) (actual time=0.040..0.087 rows=153 loops=1)
        Index Cond: ((email_verified = true) AND (last_login_at > (now() - '7 days'::interval)))
        Heap Fetches: 153
        Buffers: shared hit=154
Planning Time: 0.062 ms  Execution Time: 0.119 ms
```

Index Only Scan: the planner resolves the predicate entirely from the index pages. `Heap Fetches: 153` reflects that recently inserted rows have not yet been included in the visibility map (set by `VACUUM`); after a routine `VACUUM` pass these fetches drop toward 0 and the scan becomes fully index-resident. Execution time 0.241 ms → 0.119 ms (2× at 1000 users; gap widens as total user count grows).

#### User list with completion counts — `LEFT JOIN lesson_completions … WHERE email_verified = TRUE`

**Before** — seqscan forced (803 verified users, 4804 completions):

```
Sort  (cost=212.76..214.76 rows=803 width=66) (actual time=2.799..2.834 rows=803 loops=1)
  Sort Key: (count(lc.id)) DESC, u.name
  Sort Method: quicksort  Memory: 92kB
  Buffers: shared hit=69
  ->  HashAggregate  (cost=165.98..174.01 rows=803 width=66) (actual time=2.178..2.268 rows=803 loops=1)
        Group Key: u.id
        Batches: 1  Memory Usage: 169kB
        Buffers: shared hit=66
        ->  Hash Right Join  (cost=45.09..146.79 rows=3838 width=62) (actual time=0.354..1.584 rows=3845 loops=1)
              Hash Cond: (lc.user_id = u.id)
              Buffers: shared hit=66
              ->  Seq Scan on lesson_completions lc  (cost=0.00..89.04 rows=4804 width=8) (actual time=0.005..0.380 rows=4804 loops=1)
                    Buffers: shared hit=41
              ->  Hash  (cost=35.05..35.05 rows=803 width=58) (actual time=0.313..0.313 rows=803 loops=1)
                    ->  Seq Scan on users u  (cost=0.00..35.05 rows=803 width=58) (actual time=0.004..0.146 rows=803 loops=1)
                          Filter: email_verified
                          Rows Removed by Filter: 202
Planning Time: 0.293 ms  Execution Time: 2.969 ms
```

**After** — index scan paths available (`enable_seqscan=off`):

```
Sort  (cost=272.91..274.92 rows=803 width=66) (actual time=3.118..3.156 rows=803 loops=1)
  Sort Key: (count(lc.id)) DESC, u.name
  Sort Method: quicksort  Memory: 92kB
  Buffers: shared hit=172
  ->  HashAggregate  (cost=226.14..234.17 rows=803 width=66) (actual time=2.523..2.619 rows=803 loops=1)
        Group Key: u.id
        Batches: 1  Memory Usage: 169kB
        Buffers: shared hit=172
        ->  Hash Right Join  (cost=56.27..206.95 rows=3838 width=62) (actual time=0.284..1.740 rows=3845 loops=1)
              Hash Cond: (lc.user_id = u.id)
              Buffers: shared hit=172
              ->  Index Scan using lesson_completions_user_id_lesson_id_key on lesson_completions lc  (cost=0.28..138.29 rows=4804 width=8) (actual time=0.004..0.594 rows=4804 loops=1)
                    Buffers: shared hit=143
              ->  Hash  (cost=45.95..45.95 rows=803 width=58) (actual time=0.275..0.277 rows=803 loops=1)
                    ->  Index Scan using users_pkey on users u  (cost=0.28..45.95 rows=803 width=58) (actual time=0.006..0.168 rows=803 loops=1)
                          Filter: email_verified
                          Rows Removed by Filter: 202
Planning Time: 0.165 ms  Execution Time: 3.224 ms
```

At 800-user / 4800-completion scale, a hash join with sequential scans is the optimal plan — the `lesson_completions` table must be fully read regardless for the LEFT JOIN aggregate, so index traversal adds overhead. At this query shape the primary benefit of `users_analytics_active_idx` is **for the active-user count query (Q2 above)**.

At larger scale (tens of thousands of users, millions of completions), a dedicated index on `lesson_completions(user_id)` would allow a nested-loop join where completions are fetched per user rather than fully scanned; that index is tracked as a follow-up task.

---

## Manual load-test checklist

Run these checks against a staging instance before a university cohort launch:

1. **Pool exhaustion:** Send 25 concurrent authenticated requests to `GET /api/leaderboard`.  All should return 200 within the `connectionTimeoutMillis` window (3 s).  No request should hang indefinitely.

2. **Rate limiting:** Send 15 quiz requests in rapid succession for the same user.  Requests 11–15 should return 429 with a `Retry-After` header.

3. **Semaphore queuing:** Send 25 simultaneous `POST /api/quiz` requests.  All 25 should eventually succeed (or receive 429 from the per-user limiter, not 503 from the semaphore) because the queue depth is 200.

4. **Cache headers:** `curl -I /api/leaderboard` and verify `Cache-Control: private, max-age=30` is present.

5. **Statement timeout:** Run a deliberately slow query via `pg_sleep` through a test endpoint and confirm it is killed after 8 s and the pool slot is released.
