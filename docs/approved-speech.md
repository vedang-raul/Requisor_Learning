# Approved chatbot speech

## Configuration

Keep `ELEVENLABS_API_KEY` in server-side Secrets. No credential or provider voice
ID is returned to the browser. The key needs permission to use text-to-speech and
the chosen voices. The application does not clone voices or upload recordings.

Set server-only `ELEVENLABS_VOICES` to a JSON array, using actual owner-supplied
ElevenLabs IDs (20 alphanumeric characters). Do not use `NEXT_PUBLIC_` settings.
This setting is read at request time; changing the catalog requires no speech
system rebuild. Reload the page to refresh client metadata. A hosting environment
may require a restart/redeployment to apply an environment setting.

Each entry has:

| Field | Meaning |
| --- | --- |
| `key` | Stable app key, lowercase letters/digits/hyphens; unique |
| `name` | Display name, up to 80 characters |
| `gender` | `male` or `female`, owner-selected voice label, never inferred from a learner |
| `languages` | Language metadata, such as `["en","hi"]`; at least one English locale is needed for the current English phrases |
| `voiceId` | Supplied ElevenLabs ID; omit until supplied |
| `enabled` | Boolean owner control |
| `default` | Boolean; exactly one entry must be the default |

Up to 20 entries are supported. Missing IDs or credentials produce disabled
entries with setup guidance. Invalid configuration disables the whole catalog.
With no configuration, “Female guide” and “Male guide” are setup slots, not real
provider voices; neither plays. The configured default is not linked to avatar,
language preference, profile, or demographics.

## What leaves the application

Only these fixed server-owned English strings are sent to ElevenLabs:

- `preview`: “Hello. This is a sample of the platform guide voice.”
- `platform_help`: “Open My Learning to browse courses. Select a lesson to read its material and view available activities.”
- `study_tip`: “Take a short break between study sessions. Review key ideas, then practise explaining them in your own words.”

The outbound JSON contains only `text` (one of the above) and
`model_id: eleven_multilingual_v2`. The voice ID selects the provider URL; the
credential goes in the server-only `xi-api-key` header. No user identifiers,
history, request stitching, model replies, tool results, lessons, authoring text,
student messages, profiles, progress, grades, or submissions are sent by this
speech path. Additional phrases require an independent non-personal content
review and a server catalog change—not a client eligibility flag or a PII filter.

The API reference was checked at
https://elevenlabs.io/docs/api-reference/text-to-speech/convert .
It returns MP3 audio via HTTPS. This implementation does not claim provider
zero-retention: the API documents that `enable_logging=false` is enterprise-only.

Generated and personalized chatbot replies remain text-only. No browser speech
fallback narrates chatbot replies. The existing browser microphone recognition
is unchanged; this work does not guarantee that recognition is local-only.
Other existing chatbot AI data flows are outside this task's scope.

## Safety and reliability

`GET /api/speech/` authenticates and returns safe catalog metadata/readiness,
without calling the provider. Existing `/api/health/` remains the app/DB health
check. `POST /api/speech/` authenticates and enforces same-origin JSON requests;
only `voiceKey` and `contentKey` are accepted, with a 512-byte streamed input
limit. Unknown or extra fields fail before provider access.

Speech is limited to 12 requests per authenticated account per minute, one
in-flight generation per account, four per server process, a 15-second provider
timeout, and 1 MiB of MP3 audio. Limits are process-local, matching the current
application's single-instance limiter convention; they are not fleet-wide.
Provider redirects, unexpected MIME types, oversized and empty audio fail closed.
Logs contain random request IDs, outcome categories, and elapsed time only.
Error responses never expose upstream bodies, credentials, or spoken text.

One client audio owner handles both samples and phrases. Abort plus epoch checks
prevent stale downloads/events/play promises from restarting audio after
cancellation. Voice changes, mute, stop, chat close/reset, response changes,
microphone start, navigation, account change, backgrounding and unmount cancel
old audio. Audio URLs are revoked. Speaking/avatar feedback follows the audio's
`playing` event, not request completion.

Voice and mute preferences are stored locally per account ID, with no migration
from old shared-browser TTS settings and no cross-device synchronization. Audio
and transcripts are not stored in preferences.

## Verification

Unit tests capture outbound payloads, exercise authentication, origin, invalid
keys/extra fields/forged eligibility, configuration gaps, rate and concurrency
limits, timeout/cancellation, bounded audio and safe provider errors. Playback
tests cover preview/phrase overlap, late requests/events/play promises, media
errors, autoplay rejection and local account-isolated preferences.
Browser tests use synthetic sessions and mocked audio/provider responses to
exercise the real chatbot controls without disclosing data or using invented
provider IDs. Real ElevenLabs playback needs the owner's voice IDs.
