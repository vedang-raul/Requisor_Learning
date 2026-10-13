---
name: Authentication trust boundaries
description: Privilege approval, provider linking, and shared-browser isolation rules.
---

Public registration must not grant privileged tutor access merely because a user selects a tutor account type, passes CAPTCHA, verifies an email, or presents an application-issued intent cookie. Preserve legitimately approved tutor roles when signing in.

**Why:** Identity verification is not organizational approval for privileged access.

**How to apply:** Require a separately authenticated and authorized promotion path; re-check server-side permissions for sensitive actions. Imported test-login or verification-bypass features are not evidence that their use is approved for real students.

The user explicitly approved public password-free access to the shared test-tutor account on 2026-10-13, after being warned that anyone can enter it and edit its courses. This approval does not extend to student or admin shortcuts.

**Why:** The user wants the tutor testing shortcut on the published website, independently of other test logins.

**How to apply:** Keep that access restricted to the reserved synthetic tutor identity and separately configurable. Do not make arbitrary email addresses, user-selected roles, student accounts or admin accounts eligible for the public shortcut. This exception does not change the approval requirements for ordinary tutor accounts.

Do not automatically link Google identities to existing accounts by email alone.

**Why:** Implicit linking can permit account takeover and expose account existence.

**How to apply:** Any future linking flow must require an authenticated user and explicit consent.

Keep any browser-held learning state isolated between users, and never treat it as authoritative for protected operations.

**Why:** Shared browsers must not reveal one learner's notes or progress to another, and browser state can be forged.

**How to apply:** Review account switching, logout, and server authorization together when changing persistence.

Do not attribute legacy unscoped browser drafts to whichever account signs in next.

**Why:** Their ownership is unknown; retaining them under the current account can expose another person's work on a shared browser.

**How to apply:** Use account-scoped drafts and queued actions. Ignore unscoped legacy records unless ownership can be independently established.

When an additional public domain breaks Google login, prefer starting login on the already-configured authentication origin rather than changing the OAuth callback blindly.

**Why:** Browser OAuth cookies are host-bound. Multiple public aliases can serve the same app while Google still returns to only one configured origin. Changing that origin without confirming Google's authorized redirect URI can also break users whose login already works.

**How to apply:** Keep the public marketing/SEO domain independent from the established authentication domain. Navigate to the authentication origin before creating OAuth state/PKCE cookies; do not forward credential POSTs or callback requests between domains, broaden cookie scope, or disable OAuth checks. Moving authentication to a new origin requires confirming its callback URI is authorized in Google first.
