---
name: Dependency security backports
description: Why dependency remediation preserves the current styling framework when upstream has no patch.
---

Keep the existing Tailwind 3 styling behavior during dependency-only security
work. When an unpatched transitive dependency can be fixed by a narrow security
backport, prefer a source-inspected, exactly pinned replacement over migrating
the entire styling framework.

**Why:** The upstream braces parser has no patched release, while its consumers
still depend on it. A Tailwind 4 migration would introduce unrelated visual and
configuration changes. A clean advisory scan alone is not evidence that an
unrecognized fork actually fixes the vulnerability.

**How to apply:** Compare a proposed backport with upstream source and exercise
the reported exploit through all affected entry points, plus normal consumer
behavior. Pin the inspected artifact with lockfile integrity. Revisit the
replacement when upstream provides a fix; see `docs/dependency-security.md` for
the current resolution rationale.
