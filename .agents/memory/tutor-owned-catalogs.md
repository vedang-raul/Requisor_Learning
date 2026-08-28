---
name: Tutor-owned catalogs
description: Durable authorization, concurrency, privacy, and seed-lifecycle rules for tutor-managed course catalogs.
---

Course ownership must always come from the authenticated session. Tutor writes must lock and authorize the owned course in the same transaction, and updates must require the current revision so concurrent editors receive a conflict instead of overwriting one another.

Tutor rating views are aggregate-only. Detailed learner reviews must not be exposed to tutor sessions, even when the course belongs to that tutor.

Initial catalog import is a one-time reconciliation. Once recorded, ordinary reads must not reinsert deleted seed courses; later schema-integrity migrations must use their own lifecycle and must not be skipped merely because seeding already completed.

**Why:** Separate authorization and update queries created a time-of-check/time-of-use risk, detailed review endpoints bypassed aggregate-only privacy, and continuous seed insertion made successful deletions reappear.

**How to apply:** Use atomic ownership predicates and row locks for future tutor mutations, preserve revision checks across every editor, return only rating distributions/counts to tutors, and keep seed markers distinct from later migrations.