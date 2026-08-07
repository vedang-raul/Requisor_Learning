# Threat Model

## Project Overview

Requisor Learning is an internal employee LMS for Citrus Innovations, built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and PostgreSQL (Replit). Users sign in with email/password (bcrypt, NextAuth JWT) or Google OAuth. The AI learning assistant and quiz/insights features are powered by the xAI API (Grok). Deployed publicly at `https://learning.requisor.io`.

## Assets

- **User accounts and sessions** — email addresses, bcrypt-hashed passwords, NextAuth JWT tokens, Google OAuth identifiers. Compromise allows impersonation or account takeover.
- **xAI API key** — `XAI_API_KEY` authorizes all Grok calls (chat widget + quiz + team-insights). Unrestricted access to the key leads to financial abuse and quota exhaustion.
- **User PII** — names, email addresses, employment type, position, date of birth, gender, learning goals stored in PostgreSQL. Email addresses are stored denormalized in `lesson_comments` and `course_reviews` tables for admin-path use only; they are no longer returned in API responses to regular authenticated users.
- **Application secrets** — `DATABASE_URL`, `NEXTAUTH_SECRET`/`SESSION_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `XAI_API_KEY`. Exposure of any of these has direct security or financial impact.
- **Learning progress and notes** — progress lives in `localStorage` (intentional); server-persisted notes live in `lesson_notes` table, bookmarks in `course_bookmarks`/`saved_lessons`, XP in `users.xp`.

## Trust Boundaries

- **Public Internet → Next.js API routes** — all `/api/*` routes are reachable unauthenticated unless they explicitly call `getServerSession`. No middleware enforces authentication globally.
- **Browser → Server** — the client is untrusted. Admin role checks on the admin page (`/app/admin`) are client-side only (redirect via `useEffect`), not enforced server-side for the page render.
- **API server → xAI** — the server calls xAI Grok with `XAI_API_KEY`. `/api/chat` is now correctly auth-gated (as of current code). `/api/chat` has per-user in-memory rate limiting (20 req/min); `/api/quiz` and `/api/assignment` have auth but no rate limiting.
- **API server → PostgreSQL** — parameterized queries used throughout; direct injection risk is low.
- **Authenticated user → Admin** — only `support@requisor.io` is admin. Enforced server-side by `roleForEmail()` for `notify-video`, `team-insights`, and `analytics` routes. Not enforced for the admin page render itself.

## Scan Anchors

- **Production entry points**: `app/api/chat/route.ts`, `app/api/quiz/route.ts`, `app/api/team-insights/route.ts`, `app/api/admin/notify-video/route.ts`, `app/api/admin/analytics/route.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/verify/route.ts`, `app/api/auth/forgot/route.ts`, `app/api/auth/reset/route.ts`, `app/api/comments/route.ts`, `app/api/reviews/route.ts`, `app/api/completions/route.ts`, `app/api/profile/route.ts`, `app/api/xp/route.ts`, `app/api/me/route.ts`, `app/api/assignment/route.ts`, `app/api/notes/route.ts`, `app/api/bookmarks/route.ts`, `app/api/leaderboard/route.ts`
- **Highest-risk areas**: admin panel at `/app/admin` with client-side-only guard; `/api/notes` lacks content size limits (storage abuse vector)
- **Public vs authenticated vs admin surfaces**: all `/api/auth/*` are public; all AI routes (`/api/chat`, `/api/quiz`, `/api/assignment`) now require session; `/api/team-insights`, `/api/admin/notify-video`, `/api/admin/analytics` correctly check admin session; all other `/api/*` routes properly require session
- **Dev-only**: none identified — this is a deployed production app

## Threat Categories

### Spoofing

Users authenticate via NextAuth JWT (email/password or Google). The JWT secret is `NEXTAUTH_SECRET`/`SESSION_SECRET`. The admin role is derived from the token's email field via `roleForEmail()` at JWT-creation time, which prevents role spoofing via token manipulation. Google OAuth accounts are upserted correctly with server-side role assignment.

### Tampering

No client-supplied prices or business-critical fields are present. Learning progress lives in `localStorage` — intentional. The `/api/xp` POST endpoint allows any authenticated user to set their own XP to an arbitrary integer (no server-side validation of the value), but XP has no real-world monetary value in this app.

### Information Disclosure

- ~~`GET /api/comments` and `GET /api/reviews` return `user_email`~~ — **Remediated**: `user_email` removed from both GET (and POST) response projections; ownership in the UI now uses `user_id`.
- Email addresses may appear in application error logs (e.g., `console.error(\`Notify email to ${u.email} failed\`)`). The `/api/admin/notify-video` response includes a `failures` array of email addresses for the admin caller only (acceptable since the caller is authenticated admin).
- `GET /api/leaderboard` exposes employee display names and XP scores to all authenticated users — by design for a leaderboard feature.

### Denial of Service / Financial Abuse

- ~~**Critical gap**: `/api/chat` and `/api/quiz` had no authentication check~~ — **Remediated**: both routes now enforce `getServerSession` before any processing. `/api/chat` also has per-user in-memory rate limiting (20 req/min).
- **Open gap**: `/api/quiz` and `/api/assignment` are auth-gated but have no rate limiting, allowing a logged-in user to drive unbounded xAI API consumption.
- **Open gap**: `/api/notes` POST accepts `content` of arbitrary length with no size cap. Because `lessonId` is also not validated against real lesson IDs, an authenticated user can insert an unlimited number of rows each carrying megabytes of text, exhausting database storage.

### Elevation of Privilege

The admin page at `/app/admin` enforces role only client-side (a `useEffect` redirect). While the most impactful admin APIs (`notify-video`, `team-insights`, `analytics`) have proper server-side auth, the pattern is fragile for future admin route additions. All database queries use parameterized statements, preventing SQL injection privilege escalation.

The signup endpoint previously allowed an attacker to overwrite a pending account's password hash. **This was remediated**: the handler now only refreshes the verification token for unverified accounts without touching the password hash.
