---
name: Session uid resolution
description: NextAuth token.uid can be empty when the users row is missing; API routes 401 silently.
---
API routes gate on `session.user.id`, which comes from `token.uid` resolved by email lookup in the jwt callback. If no `users` row exists at sign-in (e.g. dev-admin before the admin row was created), uid stays empty for the token's lifetime and every API call returns 401.

**Why:** This caused lesson comments to "vanish" — POSTs were 401s silently swallowed by the UI.

**How to apply:** Any provider/authorize path must guarantee a `users` row exists (dev-admin now upserts it), and the jwt callback retries the uid lookup when `token.uid` is missing. Never swallow non-ok fetch responses in the UI — surface an error state.
