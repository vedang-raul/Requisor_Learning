---
name: Deployment and database ownership boundaries
description: Avoid confusing imported external-hosting configurations with the actual live deployment.
---

Pulling a repository with external-hosting support does not authorize changing this project's database provider or prove that an external deployment exists.

**Why:** The imported repository supports other hosting environments, while this project's Replit production database was independently reachable. Deployment instructions describe possible setups, not the current live system.

**How to apply:** Establish the actual deployment and database owner before giving migration or exposure advice. Replit-managed production schema changes use the Publish workflow; external databases follow their approved migration process. Do not apply external-host build-time migrations to a managed Replit production database by assumption. Distinguish an online database from unauthenticated public access, and do not infer either from a website's visibility.

A development process alone does not prove its database connection targets development.

**Why:** If database tooling is unavailable, an application's existing pool is an alternative connection, but imported configuration could point it at an external or production database.

**How to apply:** Before fallback development DDL, confirm the actual pool matches the platform-injected managed workspace database and that the process is not a deployment. Compare connection identity internally without printing credentials. Apply only the reviewed schema delta, not an entire imported legacy migration merely because it advertises idempotence.
