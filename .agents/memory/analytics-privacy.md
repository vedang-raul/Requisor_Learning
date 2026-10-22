---
name: Custom analytics privacy
description: Privacy tradeoffs for learning, tutor and voice analytics.
---

Custom events measure product interactions through approved categories and counts, not individual learners or authored content. Treat private course slugs as the aggregate category "custom"; do not send user/lesson/job/provider voice identifiers, titles, prompts, scripts, messages, or profile information.

**Why:** Tutor-authored slugs can embed names or private course titles. Individual identifiers and free-form properties can link learning activity to people even when an event itself looks harmless. Aggregate custom-course reporting deliberately trades per-course detail for less third-party data exposure.

**How to apply:** Review every new analytics dimension for privacy and explicitly approve its values in the shared allowlist. Keep rejection tests for unknown properties and private content. Do not expand the allowlist just to make a new caller's payload pass.
