---
name: Shared AI controls
description: Why AI quotas use shared storage and concurrency locks require session-pinned database connections.
---

Paid AI controls must coordinate across workers and restarts; never fall back to local admission when shared storage fails.

**Why:** The public deployment autoscales. Local per-user quotas and local concurrency budgets multiply spending allowances as workers are added.

**How to apply:** Give paid routes stable shared quota scopes and await admission. Keep the deployment's concurrency setting consistent across workers.

Use session-pinned database connections for AI concurrency locks, not transaction-mode poolers. Keep control connections separate from the application's query pool, and hold locks through response-body consumption.

**Why:** Expiring leases can admit replacements while a long-running stream still consumes provider resources. Session locks avoid premature expiry; reserving connections from the application pool would instead starve ordinary database work. Loss of a lock connection must cancel its associated upstream request.

**How to apply:** Preserve session pooling and account for the extra active database connections when changing deployment sizing. Do not release AI admission after receiving headers alone.
