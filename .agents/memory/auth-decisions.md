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

When an additional public domain breaks Google login, prefer starting login on the already-configured authentication origin rather than changing the OAuth callback blindly.

**Why:** Browser OAuth cookies are host-bound. Multiple public aliases can serve the same app while Google still returns to only one configured origin. Changing that origin without confirming Google's authorized redirect URI can also break users whose login already works.

**How to apply:** Keep the public marketing/SEO domain independent from the established authentication domain. Navigate to the authentication origin before creating OAuth state/PKCE cookies; do not forward credential POSTs or callback requests between domains, broaden cookie scope, or disable OAuth checks. Moving authentication to a new origin requires confirming its callback URI is authorized in Google first.
