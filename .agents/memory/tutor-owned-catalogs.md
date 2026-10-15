---
name: Tutor-owned catalogs
description: Durable authorization, concurrency, privacy, and seed-lifecycle rules for tutor-managed course catalogs.
---

Course ownership must always come from the authenticated session. Tutor writes must lock and authorize the owned course in the same transaction, and updates must require the current revision so concurrent editors receive a conflict instead of overwriting one another.

Tutor reads are scoped just as strictly: course lists, analytics, aggregate ratings, assignments, grading, annotations, and related learner data must include only courses whose owner is that tutor. Seeded or unowned courses must never be automatically assigned to a tutor.

Tutor rating views are aggregate-only. Detailed learner reviews must not be exposed to tutor sessions, even when the course belongs to that tutor.

Initial catalog import is a one-time reconciliation. Once recorded, ordinary reads must not reinsert deleted seed courses; later schema-integrity migrations must use their own lifecycle and must not be skipped merely because seeding already completed.

**Why:** Separate authorization and update queries created a time-of-check/time-of-use risk, detailed review endpoints bypassed aggregate-only privacy, continuous seed insertion made successful deletions reappear, and assigning unowned seed courses exposed data unrelated to courses a tutor created.

**How to apply:** Apply the authenticated tutor's owner ID to every tutor-facing read and write, use atomic ownership predicates and row locks for mutations, preserve revision checks, return only rating distributions/counts, and leave seeded courses unowned unless explicitly created or assigned through an authorized workflow.