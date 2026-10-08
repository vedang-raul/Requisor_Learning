---
name: Chatbot speech choice
description: Intended read-aloud behavior and the user's chosen speech provider.
---

Automatically read full assistant replies with the selected ElevenLabs voice when unmuted. Browser-generated or on-device speech is not the chosen replacement.

**Why:** The user requested the previous automatic response reading behavior with ElevenLabs and explicitly declined an on-device substitute.

**How to apply:** Send only the reply text needed for speech, disclose the provider in the UI, preserve mute and cancellation, and retain normal account authorization and credential protection. This choice does not authorize unrelated exports or broader changes to other AI features.

A selected voice's language determines the spoken language, not just its accent or gender.

**Why:** The user explicitly expects the Marathi male voice to speak Marathi rather than read English in that voice, and approved extending narration to the other languages in their voice list.

**How to apply:** Match narration to the selected voice's language, including playback of earlier written replies. Changing a voice ID alone does not translate its text. Keep written replies unchanged and do not silently fall back to English when translation fails.

Keep voice selection as a compact dropdown in the chatbot, not a separate voice-card panel.

**Why:** The user explicitly asked to remove the large voice-selection UI and restore a dropdown.

**How to apply:** Preserve narration and mute/stop behavior when changing the selector; do not reintroduce a separate voice settings panel without being asked.

Do not show a per-reply "Read aloud" button.

**Why:** The user explicitly requested its removal and reiterated that it was still visible.

**How to apply:** Keep automatic narration when unmuted and the header voice/mute/stop controls. Error messages must not direct users to the removed button.

Reduce startup delay without changing the chosen voice, spoken language, or written answer.

**Why:** The user approved early sentence narration and preloading the next passage to reduce voice-loading delays. Waiting for the cosmetic typing animation adds unnecessary delay; switching providers or dropping translation would violate existing choices.

**How to apply:** Narrate stable visible text, not action metadata or unfinished markup. Keep lookahead bounded to one future audio passage and freeze voice selection for each narration session. Stop, mute, voice changes, account changes and navigation invalidate that session: later reply tokens must not restart it. Keep prefetched audio ephemeral and account-isolated rather than introducing shared or persistent reply caches.
