# Threat Model

## Project Overview

Requisor Learning is an internal employee LMS for Citrus Innovations, built with Next.js 16 (App Router), TypeScript, Tailwind CSS, and PostgreSQL (Replit). Users sign in with email/password (bcrypt, NextAuth JWT) or Google OAuth. The AI learning assistant and quiz/insights features are powered by the xAI API (Grok). Deployed publicly at `https://learning.requisor.io`.

## Assets

- **User accounts and sessions** — email addresses, bcrypt-hashed passwords, NextAuth JWT tokens, Google OAuth identifiers. Compromise allows impersonation or account takeover.
- **xAI API key** — `XAI_API_KEY` authorizes all Grok calls (chat widget, quiz, assignment, comment moderation, course assessment, and team insights). Unrestricted access to the key leads to financial abuse and quota exhaustion.
- **User PII** — names, email addresses, employment type, position, date of birth, gender, learning goals stored in PostgreSQL. Email addresses are stored denormalized in `lesson_comments` and `course_reviews` tables for admin-path use only; they are no longer returned in API responses to regular authenticated users.
- **Application secrets** — `DATABASE_URL`, `NEXTAUTH_SECRET`/`SESSION_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `XAI_API_KEY`. Exposure of any of these has direct security or financial impact.
- **Learning progress and notes** — progress lives in `localStorage` (intentional); server-persisted notes live in `lesson_notes` table, bookmarks in `course_bookmarks`/`saved_lessons`, XP in `users.xp`.
- **Outbound email capability** — the connected Gmail account sends verification, reset, welcome, and notification messages from `support@requisor.io`; quota exhaustion disrupts account operations.

## Trust Boundaries

- **Public Internet → Next.js API routes** — all `/api/*` routes are reachable unauthenticated unless they explicitly call `getServerSession`. No middleware enforces authentication globally, so each handler must maintain its own auth gate.
- **Browser → Server** — the client is untrusted. User identity and authorization are derived server-side from the NextAuth session; localStorage learning state is not an authorization source.
- **API server → xAI** — the server calls xAI Grok with `XAI_API_KEY`, never the browser. `/api/chat` is auth-gated and has a per-user in-memory rate limit (20 req/min). Quiz input is authenticated, stream-size-bounded, and field-capped; quiz, assignment, comment moderation, and course assessment do not yet have durable, distributed per-user rate limits.
- **API server → PostgreSQL** — parameterized queries are used throughout; direct injection risk is low. Notes and bookmark bulk writes enforce request-size, item-count, and known-content limits before writing.
- **API server → Gmail** — public password-reset requests and authenticated/admin notification flows can consume the connected sender's quota. Reset requests use an atomic per-account cooldown before delivery is scheduled.
- **Authenticated user → Admin** — only `support@requisor.io` is admin. Admin APIs enforce the role/email server-side, and `middleware.ts` protects `/app/admin` and its nested pages before rendering.

## Scan Anchors

- **Production entry points**: `app/api/chat/route.ts`, `app/api/quiz/route.ts`, `app/api/assignment/route.ts`, `app/api/course-assessment/route.ts`, `app/api/team-insights/route.ts`, `app/api/admin/notify-video/route.ts`, `app/api/admin/analytics/route.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/signup/route.ts`, `app/api/verify/route.ts`, `app/api/forgot/route.ts`, `app/api/reset/route.ts`, `app/api/comments/route.ts`, `app/api/reviews/route.ts`, `app/api/completions/route.ts`, `app/api/profile/route.ts`, `app/api/xp/route.ts`, `app/api/me/route.ts`, `app/api/notes/route.ts`, `app/api/bookmarks/route.ts`, `app/api/leaderboard/route.ts`.
- **Highest-risk areas**: authenticated xAI generation and moderation in `/api/quiz`, `/api/assignment`, `/api/comments`, and `/api/course-assessment` lacks durable distributed rate limiting; `/api/assignment` accepts uncapped prompt fields; comment and course-assessment routes need lesson/course allowlist validation. The chat limiter is process-local and resets on restart.
- **Public vs authenticated vs admin surfaces**: auth/account routes (`/api/auth/*`, signup, verify, forgot, reset) are public; user APIs and AI generation routes require a session; `/api/team-insights`, `/api/admin/notify-video`, and `/api/admin/analytics` plus admin bug-report operations require the admin session; `/app/admin/**` is middleware-protected.
- **Dev-only**: the `dev-admin` NextAuth provider exists only when `NODE_ENV !== production`; production assumptions exclude it.

## Threat Categories

### Spoofing

Users authenticate via NextAuth JWT (email/password or Google). The JWT secret is `NEXTAUTH_SECRET`/`SESSION_SECRET`. The admin role is derived from the token's email field via `roleForEmail()` at JWT-creation time, which prevents role spoofing via token manipulation. Google OAuth accounts are upserted correctly with server-side role assignment. Reset and verification tokens are random, stored SHA-256-hashed, single-use, and expiry-checked.

### Tampering

No client-supplied prices or business-critical financial fields are present. Learning progress lives in `localStorage` — intentional. The `/api/xp` POST endpoint allows any authenticated user to set their own XP to an arbitrary integer (no server-side validation), but XP has no real-world monetary value in this app. All sensitive object mutations use the session user ID/email and parameterized SQL.

### Information Disclosure

- ~~`GET /api/comments` and `GET /api/reviews` return `user_email`~~ — **Remediated**: `user_email` removed from both GET (and POST) response projections; ownership in the UI uses `user_id`.
- Email addresses may appear in application error logs (for example, notification failures). The `/api/admin/notify-video` response includes failure email addresses for the authenticated admin only.
- `GET /api/leaderboard` exposes employee display names and XP scores to all authenticated users — by design for a leaderboard feature.
- AI responses are returned only to the requesting authenticated user; client-supplied chat context is not persisted or used for privileged actions.

### Denial of Service / Financial Abuse

- **Remediated**: AI routes enforce sessions. `/api/chat` has a 20-request-per-minute per-user limiter and upstream timeout. `/api/quiz` now applies an 8 KiB streaming body ceiling before parsing and also caps prompt fields.
- **Remediated**: notes enforce known lesson IDs, a content cap, per-request and per-user limits, and a 5 MiB body ceiling. Bookmark writes enforce size/item limits, allowlists, deduplication, and set-based database operations. Password resets use a 10-minute atomic cooldown.
- **Open gap**: `/api/quiz`, `/api/assignment`, `/api/comments`, and `/api/course-assessment` are auth-gated but have no durable distributed rate limit, allowing a logged-in user to drive repeated xAI API consumption. Assignment also accepts uncapped title, description, takeaways, and original-assignment fields, amplifying per-request token cost.
- **Open gap**: comment moderation can fail open during an xAI outage, comment lesson IDs are not checked against the known lesson list, and course-assessment PATCH accepts arbitrary course slugs.
- **Residual risk**: the chat limiter is in-memory and per process, so it does not coordinate across multiple instances or survive restarts.

### Elevation of Privilege

Admin APIs (`notify-video`, `team-insights`, `analytics`, and admin bug-report operations) check the admin email/role server-side, while `middleware.ts` protects the admin page route. Regular user profile updates explicitly enumerate writable fields and do not accept role, email, verification, or password fields. All database queries use parameterized statements, preventing SQL injection privilege escalation. The signup endpoint previously allowed an attacker to overwrite a pending account's password hash; this was remediated so it only refreshes the verification token for unverified accounts.

## Security Guarantees

- User data APIs MUST derive identity from a verified server-side session and never from localStorage or request-supplied identity fields.
- Admin routes and admin APIs MUST require the server-derived admin role. Unauthenticated visitors redirect to sign-in; authenticated non-admins redirect to the learner dashboard.
- AI provider, database, OAuth, and session secrets MUST remain server-only and must not be recorded in source, test fixtures, browser output, or operational reports.
- AI-generation endpoints MUST authenticate before reading bodies or checking provider configuration, enforce a streaming request-size ceiling, validate generated response shapes, and return generic user-safe errors.
- Mutable bulk endpoints MUST bound request bytes and user-controlled collection sizes before database work begins.
- Password reset delivery MUST be rate-limited without revealing whether an account exists.

## Verification Approach

- Jest regression tests cover bounded JSON parsing, password-reset bounds, quiz authentication/body handling, and the admin middleware’s unauthenticated, employee, and admin paths.
- Browser smoke tests should verify sign-in, opening a lesson, opening the quiz action, and restricted access to `/app/admin/` in development before release.
- Full dependency, static, and dataflow scans should be rerun before major releases or whenever authentication, external services, or storage boundaries change.
