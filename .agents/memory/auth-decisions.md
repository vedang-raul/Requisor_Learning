---
name: Authentication trust boundaries
description: Privilege approval, provider linking, and shared-browser isolation rules.
---

Public registration must not grant privileged tutor access merely because a user selects a tutor account type, passes CAPTCHA, verifies an email, or presents an application-issued intent cookie. Preserve legitimately approved tutor roles when signing in.

**Why:** Identity verification is not organizational approval for privileged access.

**How to apply:** Require a separately authenticated and authorized promotion path; re-check server-side permissions for sensitive actions. Imported test-login or verification-bypass features are not evidence that their use is approved for real students.

Do not automatically link Google identities to existing accounts by email alone.

**Why:** Implicit linking can permit account takeover and expose account existence.

**How to apply:** Any future linking flow must require an authenticated user and explicit consent.

Keep any browser-held learning state isolated between users, and never treat it as authoritative for protected operations.

**Why:** Shared browsers must not reveal one learner's notes or progress to another, and browser state can be forged.

**How to apply:** Review account switching, logout, and server authorization together when changing persistence.
