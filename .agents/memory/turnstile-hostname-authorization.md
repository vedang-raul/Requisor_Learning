---
name: Turnstile hostname authorization
description: Operational prerequisites for Cloudflare Turnstile across production and Replit development previews.
---

**Rule:** Whenever Turnstile is enabled, authorize the production custom domain and the active Replit development hostname in the widget's Cloudflare Hostname Management settings.

**Why:** Cloudflare will not issue a usable challenge token for an unapproved hostname. The client then has no token to send, which blocks every protected authentication flow before it reaches the server.

**How to apply:** After adding or rotating a site key, verify the widget's hostname list against the published domain and the current development preview hostname. Cloudflare hostnames must be fully qualified domains; wildcards are not accepted, though an approved parent hostname covers its subdomains.