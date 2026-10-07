---
name: Chatbot speech choice
description: Intended read-aloud behavior and the user's chosen speech provider.
---

Automatically read full assistant replies with the selected ElevenLabs voice when unmuted. Browser-generated or on-device speech is not the chosen replacement.

**Why:** The user requested the previous automatic response reading behavior with ElevenLabs and explicitly declined an on-device substitute.

**How to apply:** Send only the reply text needed for speech, disclose the provider in the UI, preserve mute and cancellation, and retain normal account authorization and credential protection. This choice does not authorize unrelated exports or broader changes to other AI features.
