---
name: Database index verification
description: Interpreting index-only scans without misleading conclusions after fresh writes.
---

Do not treat nonzero heap fetches immediately after database writes as proof that an index-only scan is ineffective.

**Why:** PostgreSQL's visibility map may not yet mark recently written pages all-visible; heap fetches can fall after vacuuming.

**How to apply:** Interpret query plans in the context of recent writes and vacuum activity, and verify representative workload performance before changing indexes. Discover current migration ownership from the code and actual hosting environment rather than relying on old post-merge-script notes.
