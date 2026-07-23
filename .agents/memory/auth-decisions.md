---
name: Auth decisions
description: Non-obvious decisions in the real auth system to stay consistent with
---

- Admin role is **derived from the email at session time** (`roleForEmail`, support@requisor.io), never trusted from the DB row — prevents privilege escalation via DB edits and keeps Google/credentials paths consistent.
- Verification & password-reset tokens are stored **SHA-256 hashed**; the raw token exists only in the emailed link. **Why:** DB exposure must not allow account takeover.
- Unverified accounts may re-sign-up (token rotates); only `email_verified = TRUE` blocks signup.
- Client learning state stays in localStorage but is **namespaced per user email**. **Why:** shared browsers must not leak one user's progress/notes to another.
- `NEXTAUTH_URL` is derived at runtime in `lib/base-url.ts` from REPLIT_DEV_DOMAIN / REPLIT_DOMAINS — don't hardcode domains.
- Emails send via the Replit Gmail connector proxy (`POST /gmail/v1/users/me/messages/send` with base64url MIME); the connected account must remain support@requisor.io.
