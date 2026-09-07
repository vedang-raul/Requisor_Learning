---
name: Protected file previews
description: Security-header constraints for authenticated files rendered inside the app's same-origin iframes.
---

Protected PDF preview routes must remain authenticated and ownership-checked, while their response CSP permits only same-origin framing. The parent page CSP must also include same-origin in `frame-src`, and global `X-Frame-Options: DENY` rules must exclude only these narrowly designated file routes.

**Why:** The browser blocked an authorized tutor submission even though the API returned the PDF successfully. Next.js trailing-slash normalization also meant an exact path comparison silently missed the actual `/file/` request.

**How to apply:** Keep `frame-ancestors 'none'` and `X-Frame-Options: DENY` as defaults. For a protected inline file route, use a prefix/path match that covers normalized trailing slashes, set `frame-ancestors 'self'`, allow `'self'` in the parent `frame-src`, and add a regression test for the normalized URL.