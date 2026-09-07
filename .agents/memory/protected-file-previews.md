---
name: Protected file previews
description: Security-header constraints for authenticated files rendered inside the app's same-origin iframes.
---

Protected PDF preview routes must remain authenticated and ownership-checked. Fetch the authorized PDF in the page and render a temporary browser `blob:` URL rather than framing the protected API response directly. The parent CSP must explicitly allow `blob:` in `frame-src`.

**Why:** Chrome continued blocking a directly framed, authorized API response even after same-origin CSP and X-Frame exceptions were aligned. Next.js trailing-slash normalization also meant an exact path comparison silently missed the actual `/file/` request.

**How to apply:** Keep restrictive framing headers as defaults. Fetch protected bytes using the active session, check the response before creating an object URL, revoke it on cleanup, show loading/error states, allow `blob:` in `frame-src`, and test normalized trailing-slash routes.