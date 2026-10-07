/**
 * The assistant's spoken voice, through ElevenLabs. The key stays on the
 * server (app/api/tts); the browser only ever receives audio. Without a key
 * the assistant falls back to the browser's built-in voice.
 *
 *   ELEVENLABS_API_KEY             turns it on
 *   ELEVENLABS_VOICE_ID_<NAME>     one line per character the learner can pick, e.g.
 *                                  ELEVENLABS_VOICE_ID_IVANNA, ELEVENLABS_VOICE_ID_UNCLE_SAM.
 *                                  The value is a voice ID from the ElevenLabs voice library;
 *                                  the name is what the picker shows ("Ivanna", "Uncle Sam").
 *   ELEVENLABS_VOICE_STYLE_<NAME>  how that character talks, in a sentence or two (optional). The
 *                                  assistant then writes its replies that way, so the words match
 *                                  the voice. Arthur has a built-in style; this overrides it.
 *   ELEVENLABS_VOICE_ID            a single voice, shown as "Default" (optional)
 *   ELEVENLABS_DEFAULT_VOICE       which character speaks until the learner picks one (optional)
 *   ELEVENLABS_MODEL               defaults to the fast multilingual model
 */
/** ElevenLabs bills per character, so one reply is capped. Replies are normally well under this. */
export const TTS_MAX_CHARS = 1500;
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_MODEL = "eleven_flash_v2_5";

export function ttsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export type TtsCharacter = { key: string; name: string };
const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
const VOICE_VAR = /^ELEVENLABS_VOICE_ID_([A-Z0-9]+(?:_[A-Z0-9]+)*)$/;
const MAX_CHARACTERS = 24;

/** Every voice set up in the environment, with its voice ID. Server-side only. */
function voices(): (TtsCharacter & { voiceId: string })[] {
  const found: (TtsCharacter & { voiceId: string })[] = [];
  for (const [variable, value] of Object.entries(process.env)) {
    const match = VOICE_VAR.exec(variable);
    const voiceId = (value ?? "").trim();
    if (!match || !VOICE_ID.test(voiceId)) continue;
    const words = match[1].toLowerCase().split("_");
    found.push({ key: words.join("-"), name: words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" "), voiceId });
  }
  found.sort((a, b) => a.name.localeCompare(b.name));
  const single = (process.env.ELEVENLABS_VOICE_ID ?? "").trim();
  if (VOICE_ID.test(single)) found.unshift({ key: "default", name: "Default", voiceId: single });
  if (!found.length) found.push({ key: "default", name: "Default", voiceId: DEFAULT_VOICE_ID });

  const preferred = (process.env.ELEVENLABS_DEFAULT_VOICE ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const first = found.findIndex((voice) => voice.key === preferred);
  if (first > 0) found.unshift(...found.splice(first, 1));
  return found.slice(0, MAX_CHARACTERS);
}

/** The characters a learner can choose between, first one being the default. Never includes voice IDs. */
export function ttsCharacters(): TtsCharacter[] {
  return voices().map(({ key, name }) => ({ key, name }));
}

/** The voice ID for a character; an unknown or missing one gets the default character. */
export function ttsVoiceId(character?: unknown): string {
  const all = voices();
  return (all.find((voice) => voice.key === character) ?? all[0]).voiceId;
}

/** How a character talks, when it has a manner of its own. Kept short: it is added to every chat request. */
const BUILT_IN_STYLES: Record<string, string> = {
  arthur:
    "a plain-spoken cowboy of the old American West, warm and unhurried. Sprinkle in a little Western and Southern US vocabulary: \"howdy\", \"partner\", \"reckon\", \"y'all\", \"much obliged\", \"ain't\", and the odd trail or ranch comparison",
};
const STYLE_MAX_CHARS = 400;

/** The speaking style for a chosen character, or "" when it has none or isn't a character on this server. */
export function ttsCharacterStyle(character: unknown): { name: string; style: string } | null {
  const found = voices().find((voice) => voice.key === character);
  if (!found) return null;
  const custom = (process.env[`ELEVENLABS_VOICE_STYLE_${found.key.toUpperCase().replace(/-/g, "_")}`] ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, STYLE_MAX_CHARS);
  const style = custom || BUILT_IN_STYLES[found.key] || "";
  return style ? { name: found.name, style } : null;
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
