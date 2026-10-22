---
name: External-provider test isolation
description: Why unit tests for local provider fallbacks need a credential-free environment on Replit.
---

Tests intended to exercise an offline/local fallback must not inherit live connector identity.

**Why:** Replit injects connector identity into the workspace. An email test expecting local-only logging instead entered the Gmail transport even though its mock did not support that transport. This failure was unrelated to the imported repository changes.

**How to apply:** Isolate credentials in the test subprocess or explicitly mock the selected connector. Never remove the running app's identity or change email delivery settings to make a unit test pass. Passing these tests does not verify real email delivery.

Separate full-app fixture readiness from control interaction checks.

**Why:** Mocked signed-in browser checks have intermittently reached the chatbot with an empty voice catalog, even while the same selection interactions passed in another browser context. A timeout before options load does not establish that the dropdown itself is broken.

**How to apply:** Assert account and catalog readiness explicitly, use valid identity and response shapes, and report unresolved fixture/bootstrap failures separately. Do not weaken authentication, increase production timeouts, or change narration behavior merely to make a browser fixture pass.
