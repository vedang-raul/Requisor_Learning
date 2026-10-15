---
name: Database indexes
description: Which indexes exist on key tables, their origin, and how to add new ones safely.
---

# Database indexes

## Rule
All application indexes are declared with `CREATE INDEX IF NOT EXISTS` in `scripts/post-merge.sh`. That script is the single idempotent source of truth; never create indexes outside it.

**Why:** Keeps every environment (dev, staging, prod, bare restore) in sync automatically on deploy.

**How to apply:** Add the `CREATE INDEX IF NOT EXISTS` statement inside the existing `p.query(\`...\`)` block in post-merge.sh, re-run the script, verify with `pg_indexes`.

## Current indexes on `users`

| Index | Definition | Origin |
|---|---|---|
| `users_pkey` | UNIQUE (id) | Table DDL primary key |
| `users_email_key` | UNIQUE (email) | Table DDL UNIQUE; also in post-merge.sh for bare-restore safety |
| `users_google_id_unique` | UNIQUE (google_id) WHERE google_id IS NOT NULL | post-merge.sh |
| `users_leaderboard_idx` | (role, xp DESC, last_login_at DESC NULLS LAST) | post-merge.sh |
| `users_analytics_active_idx` | (email_verified, last_login_at) | post-merge.sh |

## Leaderboard index effect
`users_leaderboard_idx` converts the `ROW_NUMBER()` window sort from a 102 kB O(N log N) full quicksort → incremental sort (27 kB avg per group) + index scan. Planning time 1.38 ms → 0.14 ms at 1000-user scale.

## Analytics active-user index effect
`users_analytics_active_idx` upgrades the `WHERE email_verified = TRUE AND last_login_at > NOW() - INTERVAL '7 days'` count to an Index Only Scan. Heap fetches are non-zero on freshly written rows; drop to 0 after VACUUM runs.

## Shell-string quoting gotcha
SQL comments inside `node -e "... p.query(\`...\`) ..."` must not contain double-quote characters — they terminate the outer shell double-quoted string and cause "Unterminated template" errors in Node. Remove or rephrase double quotes in SQL comments.

## Outstanding follow-up
A dedicated `lesson_completions(user_id)` index would allow a nested-loop join in the analytics Q1 query at millions-of-completions scale (proposed as a separate task).
