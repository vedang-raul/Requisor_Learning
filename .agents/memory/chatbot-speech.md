---
name: Chatbot speech choice
description: Intended read-aloud behavior and the user's chosen speech provider.
---

Automatically read full assistant replies with the selected ElevenLabs voice when unmuted. Browser-generated or on-device speech is not the chosen replacement.

**Why:** The user requested the previous automatic response reading behavior with ElevenLabs and explicitly declined an on-device substitute.

**How to apply:** Send only the reply text needed for speech, disclose the provider in the UI, preserve mute and cancellation, and retain normal account authorization and credential protection. This choice does not authorize unrelated exports or broader changes to other AI features.

A selected voice's language determines the spoken language, not just its accent or gender.

**Why:** The user explicitly expects the Marathi male voice to speak Marathi rather than read English in that voice.

**How to apply:** Match narration to the selected voice's language, including playback of earlier written replies. Do not silently fall back to English when Marathi translation fails.
