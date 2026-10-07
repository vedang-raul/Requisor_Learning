---
name: Onboarding and local personalization
description: Why onboarding completion is independent of profile answers and how personalization is constrained.
---

Onboarding completion must be independent of whether optional profile fields were filled in.

**Why:** A learner may legitimately leave qualification or learning goals blank; missing optional answers do not mean onboarding was never completed.

**How to apply:** Keep an explicit completion decision and avoid requiring unrelated profile fields during onboarding-only saves.

Keep learner profile information out of external AI requests, even when personalization is useful.

**Why:** The university prohibits sharing student information with the chatbot's AI provider. Earlier personalization plans do not override that restriction.

**How to apply:** Personalize using private in-app logic; do not reintroduce outbound profile prompts or trust caller-supplied educational records.
