---
name: SEO preview boundaries
description: Separate workspace-proxy indexing restrictions and Next.js development sharing URLs from production SEO behavior.
---

SEO positioning should target student learning LMS searches while retaining the Alma university brand and describing actual student-facing capabilities.

**Why:** The user explicitly requested improved Google visibility for student learning LMS, rather than a product rating.

**How to apply:** Use useful public content and natural wording about student learning, not keyword stuffing, fabricated ratings or guaranteed search positions. Keep private learning content and accounts out of search indexes.

Do not infer production indexing policy from the preview proxy's combined HTTP headers.

**Why:** The proxied workspace injects additional noindex directives on all responses, including public marketing pages and robots/sitemap files. These are independent of the application's own metadata and middleware headers.

**How to apply:** Verify application indexing rules in tests and rendered metadata. Treat preview headers as composite values, not exact strings. Verify the published response separately after publishing; never remove private-route noindex safeguards to counteract workspace-proxy directives.

Development-generated sharing-image URLs do not establish the public image URL.

**Why:** Next.js file-based metadata generated a localhost image URL in development even with a production metadata base.

**How to apply:** Use the verified production origin for social metadata and ensure its image path is served by the app. Test the actual image response and dimensions rather than assuming a generated metadata URL is publicly reachable. Refresh deployment information before changing production origins.
