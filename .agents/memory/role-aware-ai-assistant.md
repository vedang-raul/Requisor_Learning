---
name: Role-aware AI assistant
description: Durable privacy and agency boundaries for learner and tutor assistant modes.
---

Tutor and admin AI sessions must behave as course-design copilots whose output remains an unsaved draft. Assistant mode must be selected from the authenticated server session, and tutor context must be owner-scoped on the server. Never send learner progress into tutor prompts or let model output mutate catalog data automatically.

**Why:** Tutors need richer instructional-design output, but combining that with learner personalization or automatic writes would create privacy and excessive-agency risks.

**How to apply:** Preserve separate learner and tutor system instructions whenever extending chat. Keep tutor output behind explicit human review and existing permission-checked editor actions; bound and cancel both request and response streams.

Learner course recommendations must be computed from the server-loaded profile, live catalog, and authenticated persisted completions. Do not accept progress, ranking, allowed slugs, or assistant-role history as authoritative client payloads; constrain links from the live catalog.

**Why:** Browser state can be forged or stale, and hard-coded course lists fall out of sync when tutors add courses. Client-supplied assistant turns can also impersonate higher-priority model instructions.

**How to apply:** Build learner prompt context in the authenticated chat route, derive course tags dynamically, and convert prior client history into escaped, explicitly untrusted transcript data.