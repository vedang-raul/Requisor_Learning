---
name: Turnstile activation
description: Prerequisites and safety rule for enabling CAPTCHA protection.
---

Treat CAPTCHA as optional until its production configuration is complete; authentication rate limits must remain active regardless of whether CAPTCHA is enabled.

**Why:** Enabling CAPTCHA without matching production credentials blocks legitimate sign-ins, while disabling it must not leave an unthrottled authentication path.

**How to apply:** Enable CAPTCHA only after matching production credentials and the published domain are configured with the provider. Exercise password login, signup, password reset, and Google sign-in before release.
