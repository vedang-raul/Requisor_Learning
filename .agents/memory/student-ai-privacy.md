---
name: University student-data restriction
description: Standing university prohibition that applies to every external AI feature, including imported capabilities.
---

The user stated: "university has strickly restricted us for sharing student info with ai agent which we are using for chatbot."

**Why:** This is an institutional restriction, not a preference that can be waived by a chatbot prompt or by importing new code.

**How to apply:** Treat identity, profiles, demographics, educational records, progress, mastery, scores, notes, work, submissions, comments, rosters, and free-form student communications as protected. They must not enter external model requests through chat context, personalization, tool results, moderation, grading, or tutor/admin authoring. Redaction alone is not a guarantee for arbitrary text. Do not claim compliance without checking outbound payloads; preserve safe local learning assistance where possible.

External speech output is also covered. The user explicitly approved ElevenLabs only for approved non-personal text, with personalized replies and student messages remaining text-only.

**Why:** A speech provider receives the text it voices; omitting names does not make educational records or personalized replies non-personal.

**How to apply:** Require independently approved, server-owned content before external speech generation. Do not treat arbitrary model output, user-selected text, or confirmation as permission to send protected text, and do not silently route it through a browser-speech fallback.

Voice-language metadata does not approve new speech text or automatic translations.

**Why:** The approval applies to reviewed non-personal content, not to everything a selected multilingual voice could narrate. Translating or generating text dynamically would bypass that review boundary.

**How to apply:** Review each additional language's fixed phrases before adding them to the speech allowlist. Keep profile language preferences separate from speech eligibility.
