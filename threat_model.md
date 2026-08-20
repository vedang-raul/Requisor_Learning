# Threat Model

## Project Overview

Requisor Learning is an internal employee LMS for Citrus Innovations, built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and PostgreSQL (Replit). Users sign in with email/password (bcrypt, NextAuth JWT) or Google OAuth. The AI learning assistant and quiz/insights features are powered by the xAI API (Grok). Deployed publicly at `https://learning.requisor.io`.

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
- **API server → xAI** — the server calls xAI Grok with `XAI_API_KEY`. `/api/chat` is auth-gated and has a per-user in-memory rate limit (20 req/min); `/api/quiz`, `/api/assignment`, comment moderation, and course-assessment are authenticated but have no per-user rate limit, and assignment prompt fields are not size-capped.
- **API server → PostgreSQL** — parameterized queries are used throughout; direct injection risk is low. Bulk notes and bookmark migration handlers fan out unbounded user-controlled entries and can consume storage/connections.
- **API server → Gmail** — public password-reset requests and authenticated/admin notification flows can consume the connected sender's quota. Reset requests have no cooldown or rate limit.
- **Authenticated user → Admin** — only `support@requisor.io` is admin. Admin APIs enforce the role/email server-side, and `middleware.ts` protects `/app/admin` and its nested pages before rendering.

## Scan Anchors

- **Production entry points**: `app/api/chat/route.ts`, `app/api/quiz/route.ts`, `app/api/assignment/route.ts`, `app/api/course-assessment/route.ts`, `app/api/team-insights/route.ts`, `app/api/admin/notify-video/route.ts`, `app/api/admin/analytics/route.ts`, `app/api/auth/[...nextauth]/route.ts`, `app/api/signup/route.ts`, `app/api/verify/route.ts`, `app/api/forgot/route.ts`, `app/api/reset/route.ts`, `app/api/comments/route.ts`, `app/api/reviews/route.ts`, `app/api/completions/route.ts`, `app/api/profile/route.ts`, `app/api/xp/route.ts`, `app/api/me/route.ts`, `app/api/notes/route.ts`, `app/api/bookmarks/route.ts`, `app/api/leaderboard/route.ts`.
- **Highest-risk areas**: authenticated xAI generation and moderation in `/api/quiz`, `/api/assignment`, `/api/comments`, and `/api/course-assessment` lacks rate limiting; `/api/assignment` accepts uncapped prompt fields; `/api/notes` accepts uncapped content and arbitrary lesson IDs; `/api/bookmarks` accepts uncapped bulk arrays; public `/api/forgot` can send reset email on every request.
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

- ~~**Critical gap**: `/api/chat` and `/api/quiz` had no authentication check~~ — **Remediated**: AI routes enforce sessions. `/api/chat` also has a 20-request-per-minute per-user limiter and upstream timeout.
- **Open gap**: `/api/quiz`, `/api/assignment`, `/api/comments`, and `/api/course-assessment` are auth-gated but have no rate limiting, allowing a logged-in user to drive repeated xAI API consumption. Assignment also accepts uncapped title, description, takeaways, and original-assignment fields, amplifying per-request token cost.
- **Open gap**: `/api/notes` POST and PUT accept arbitrary text and arbitrary lesson IDs with no content, key-count, or lesson allowlist limits. A user can create unlimited rows with large payloads and exhaust database storage.
- **Open gap**: `/api/bookmarks` PUT accepts unbounded bookmark/saved-lesson arrays and queues one database query per element, enabling connection-pool pressure and unlimited junk rows.
- **Open gap**: public `/api/forgot` sends a new reset email for every matching request with no per-address/IP cooldown, enabling inbox flooding and exhaustion of the connected Gmail sender quota.

### Elevation of Privilege

Admin APIs (`notify-video`, `team-insights`, `analytics`, and admin bug-report operations) check the admin email/role server-side, while `middleware.ts` protects the admin page route. Regular user profile updates explicitly enumerate writable fields and do not accept role, email, verification, or password fields. All database queries use parameterized statements, preventing SQL injection privilege escalation. The signup endpoint previously allowed an attacker to overwrite a pending account's password hash; this was remediated so it only refreshes the verification token for unverified accounts.
