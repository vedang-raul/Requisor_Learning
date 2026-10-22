---
name: Publish check constraint validation
description: Diagnosing malformed Publish SQL for unvalidated PostgreSQL CHECK constraints.
---

Prefer validated CHECK constraints in the development schema when existing rows satisfy their bounds.

**Why:** On 2026-10-22, PostgreSQL returned valid CHECK definitions with a trailing NOT VALID, but Publish's schema diff emitted extra parentheses around that suffix. Validating the development constraints made the recomputed SQL well formed without changing their expressions or deleting data.

**How to apply:** Diagnose from current catalog definitions and a fresh schema diff rather than assuming this issue recurs. Count violations in development and read-only production before validating. Never delete or truncate violating rows to force validation; ask about a data-preserving approach if violations exist. Keep the schema source consistent, and leave production DDL to Publish. Verify the newly generated SQL using temporary development tables in a rolled-back transaction.
