/**
 * The assistant's spoken voice, through ElevenLabs. The key stays on the
 * server (app/api/tts); the browser only ever receives audio. Without a key
 * the assistant falls back to the browser's built-in voice.
 *
 *   ELEVENLABS_API_KEY   turns it on
 *   ELEVENLABS_VOICE_ID  which voice speaks (from the ElevenLabs voice library)
 *   ELEVENLABS_MODEL     defaults to the fast multilingual model
 */
/** ElevenLabs bills per character, so one reply is capped. Replies are normally well under this. */
export const TTS_MAX_CHARS = 1500;
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL = "eleven_flash_v2_5";

export function ttsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export function ttsVoiceId(): string {
  const id = (process.env.ELEVENLABS_VOICE_ID ?? "").trim();
  return /^[A-Za-z0-9]{10,40}$/.test(id) ? id : DEFAULT_VOICE_ID;
}

export function ttsModel(): string {
  const model = (process.env.ELEVENLABS_MODEL ?? "").trim();
  return /^[a-z0-9_.-]{3,60}$/i.test(model) ? model : DEFAULT_MODEL;
}

/** What gets spoken: plain text, cut at the end of a sentence when a reply is too long. */
export function speechText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= TTS_MAX_CHARS) return text;
  const head = text.slice(0, TTS_MAX_CHARS);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "), head.lastIndexOf("। "));
  return end > TTS_MAX_CHARS / 2 ? head.slice(0, end + 1) : head;
}
