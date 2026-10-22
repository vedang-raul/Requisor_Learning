---
name: Persistent abuse quotas
description: Security constraints for user-created bug reports and assessment completions.
---

Bug reports use hard per-account lifetime count and encoded-media storage ceilings in addition to a rolling daily submission limit. Check quota and insert while holding a database user-row lock on the same transaction connection.

**Why:** Request throttles reset on restart and differ across workers; they cannot bound persistent storage or prevent concurrent quota bypass. Hard caps avoid deleting existing reports or introducing retention behavior without user approval.

**How to apply:** Preserve cross-worker atomicity whenever changing report writes. Media quotas count stored encoded bytes, not only decoded upload sizes. Raising a limit requires considering the total per-account storage bound.

Assessment completions must use the authoritative database course catalog, including tutor-authored courses, with a separate hard per-account cardinality limit.

**Why:** Tutors already author capstones and the course page exposes completion tracking for them. Restricting completions to built-in courses breaks existing saved progress, even though assessment personalisation still uses seed data. Accepting any nonempty slug enables persistent arbitrary-row creation.

**How to apply:** Validate catalog existence and enforce the quota atomically across workers, preserve idempotent updates at quota, and retain bounded completion reads. Do not equate seed-only assessment personalisation with the set of courses supporting completion.
