# Threat Model

## Project Overview

Requisor Learning is an internal employee LMS for Citrus Innovations, built with Next.js 14 (App Router), TypeScript, Tailwind CSS, and PostgreSQL (Replit). Users sign in with email/password (bcrypt, NextAuth JWT) or Google OAuth. The AI learning assistant and quiz/insights features are powered by the Anthropic API (Claude). Deployed publicly at `https://learning.requisor.io`.

## Assets

- **User accounts and sessions** — email addresses, bcrypt-hashed passwords, NextAuth JWT tokens, Google OAuth identifiers. Compromise allows impersonation or account takeover.
- **xAI API key** — `XAI_API_KEY` authorizes all Grok calls (chat widget + team-insights). Unrestricted access to the key leads to financial abuse and quota exhaustion.
- **User PII** — names, email addresses, employment type, position stored in PostgreSQL. Email addresses are transmitted during notification flows.
- **Application secrets** — `DATABASE_URL`, `NEXTAUTH_SECRET`/`SESSION_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `XAI_API_KEY`. Exposure of any of these has direct security or financial impact.
- **Learning progress and notes** — stored in `localStorage`, namespaced per user email. No server-side privacy enforcement for this data.

## Trust Boundaries

- **Public Internet → Next.js API routes** — all `/api/*` routes are reachable unauthenticated unless they explicitly call `getServerSession`. No middleware enforces authentication globally.
- **Browser → Server** — the client is untrusted. Admin role checks on the admin page (`/app/admin`) are client-side only (redirect via `useEffect`), not enforced server-side for all API calls.
- **API server → xAI** — the server calls xAI Grok with `XAI_API_KEY`. Any route that proxies to xAI without auth allows third parties to consume the key.
- **API server → PostgreSQL** — parameterized queries used throughout; direct injection risk is low.
- **Authenticated user → Admin** — only `support@requisor.io` is admin. Enforced by `roleForEmail()` on the server for the notify-video route, but not for all admin-adjacent API routes.

## Scan Anchors

- **Production entry points**: `app/api/chat/route.ts`, `app/api/quiz/route.ts`, `app/api/team-insights/route.ts`, `app/api/admin/notify-video/route.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/verify/route.ts`, `app/api/auth/forgot/route.ts`, `app/api/auth/reset/route.ts`
- **Highest-risk areas**: unauthenticated Anthropic proxy routes (`chat`, `quiz`, `team-insights`); admin panel at `/app/admin` with client-side-only guard
- **Public vs authenticated vs admin surfaces**: all `/api/auth/*` are public; `/api/chat`, `/api/quiz`, `/api/team-insights` are *intended* to be authenticated but are not enforced; `/api/admin/notify-video` correctly checks admin session
- **Dev-only**: none identified — this is a deployed production app

## Threat Categories

### Spoofing

Users authenticate via NextAuth JWT (email/password or Google). The JWT secret is `NEXTAUTH_SECRET`/`SESSION_SECRET`. The admin role is derived from the token's email field via `roleForEmail()` at JWT-creation time, which prevents role spoofing via token manipulation. Google OAuth accounts are upserted correctly with server-side role assignment.

### Tampering

No client-supplied prices or business-critical fields are present. Learning progress lives entirely in `localStorage` — this is intentional and not a server-side integrity concern.

### Information Disclosure

Email addresses may appear in application error logs (e.g., `console.error(\`Notify email to ${u.email} failed\`)`). The `/api/admin/notify-video` response includes a `failures` array of email addresses for the admin caller only (acceptable since the caller is authenticated admin).

### Denial of Service / Financial Abuse

**Critical gap**: `/api/chat`, `/api/quiz`, and `/api/team-insights` have no authentication check. Any unauthenticated internet user can call these endpoints, driving unbounded consumption of the Anthropic API key. There is no rate limiting. This is the highest-risk issue in the codebase.

### Elevation of Privilege

The admin page at `/app/admin` enforces role only client-side (a `useEffect` redirect). While the most impactful admin API (`notify-video`) has proper server-side auth, the `team-insights` API does not, and future admin API additions may omit the check. All database queries use parameterized statements, preventing SQL injection privilege escalation.
