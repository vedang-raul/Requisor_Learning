---
name: DB schema additions
description: New tables and columns added for analytics and comments features.
---

## Tables added
- `lesson_completions(id, user_id→users, lesson_id, course_slug, completed_at, UNIQUE user_id+lesson_id)` — synced from client on every mark-complete/undo action via POST/DELETE `/api/completions`.
- `lesson_comments(id, user_id→users, user_name, user_email, lesson_id, body, created_at)` — per-lesson Q&A, served by `/api/comments` (GET/POST) and `/api/comments/[id]` (DELETE).

## Columns added
- `users.last_login_at TIMESTAMP` — updated in Credentials `authorize` and Google `signIn` callbacks.

## Why
Progress was localStorage-only, so admin analytics were fake (leaderboardSeed). New tables make completions server-side so admin can see real team data.

## How to apply
`scripts/post-merge.sh` runs all `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` statements idempotently — it is the single source of truth for schema.
