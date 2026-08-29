---
name: Role-aware AI assistant
description: Durable privacy and agency boundaries for learner and tutor assistant modes.
---

Tutor and admin AI sessions must behave as course-design copilots whose output remains an unsaved draft. Assistant mode must be selected from the authenticated server session, and tutor context must be owner-scoped on the server. Never send learner progress into tutor prompts or let model output mutate catalog data automatically.

**Why:** Tutors need richer instructional-design output, but combining that with learner personalization or automatic writes would create privacy and excessive-agency risks.

**How to apply:** Preserve separate learner and tutor system instructions whenever extending chat. Keep tutor output behind explicit human review and existing permission-checked editor actions; bound and cancel both request and response streams.