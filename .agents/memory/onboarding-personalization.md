---
name: Onboarding & personalisation system
description: Post-login survey, profile signals, personalised quiz/assignment generation
---

# Onboarding & Personalisation

## What was built
- `qualification`, `learning_goal`, `onboarding_done` columns added to `users` table (in `post-merge.sh`)
- `GET/PATCH /api/me` — lightweight endpoint returning `{ onboardingDone, dateOfBirth, ageYears, qualification, learningGoal }`
- `GET/PATCH /api/profile` extended to include the three new fields
- `components/onboarding-survey.tsx` — full-screen modal; appears once after first login via `app/app/layout.tsx`
- `POST /api/quiz` accepts optional `userProfile: { qualification, learningGoal, ageYears }` and injects a persona line into the xAI prompt
- `POST /api/assignment` — new route that generates a personalised assignment text via xAI; falls back gracefully
- `app/app/learn/page.tsx` has a `PersonalisedAssignment` component that calls `/api/me` then `/api/assignment` on first open of the Assignment tab
- `app/app/settings/page.tsx` — qualification and learningGoal fields added to both edit form and view mode

## Key decisions
**Why onboarding_done flag instead of checking if qualification is set:**
Simple boolean is unambiguous — a user might legitimately leave qualification blank.

**Why fetch profile per-request in quiz/assignment rather than store in session:**
Avoids session token bloat; profile rarely changes; one extra fast DB read per quiz is acceptable.

**Why PATCH /api/profile handles onboarding-only saves differently:**
Onboarding save must not require `name` (which is already set from auth); the route detects `onboardingDone: true && !name` and runs a targeted UPDATE that only touches the three onboarding fields.
