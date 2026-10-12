/**
 * The assistant's spoken voice, through ElevenLabs. The key stays on the
 * server (app/api/tts); the browser only ever receives audio. Without a key
 * the assistant falls back to the browser's built-in voice.
 *
 *   ELEVENLABS_API_KEY             turns it on. The voices in BUILT_IN_VOICES below are then offered.
 *   ELEVENLABS_VOICE_ID_<NAME>     adds a further character the learner can pick, e.g.
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

/** What the browser is told about a voice. Never includes the voice ID. */
export type TtsCharacter = {
  key: string;
  name: string;
  /** Shown under the name in the picker, e.g. "Hindi · Female". */
  description?: string;
};

type Voice = TtsCharacter & {
  voiceId: string;
  /** The language this voice is meant to speak, when it isn't English: replies are written in it. */
  language?: string;
  /** English spelling and vocabulary to prefer, for an English voice with a regional accent. */
  dialect?: string;
  /** A model other than the default, for a language the default doesn't cover. */
  model?: string;
};

/**
 * The voices every deployment offers once a key is set. Voice IDs are public identifiers from the
 * ElevenLabs voice library, not secrets. Each has a portrait at public/voices/<key>.svg
 * (drawn by scripts/make-voice-avatars.js). The first one is the default.
 */
const BUILT_IN_VOICES: Voice[] = [
  { key: "english-america-female", name: "Grace", description: "English (US) · Female", voiceId: "PStJ2DzQnh8zxG5PDf1s" },
  { key: "english-america-male", name: "Ethan", description: "English (US) · Male", voiceId: "a4CnuaYbALRvW39mDitg" },
  { key: "english-british-female", name: "Dany", description: "English (UK) · Female", voiceId: "NtS6nEHDYMQC9QczMQuq", dialect: "British" },
  { key: "english-british-male", name: "Jhon", description: "English (UK) · Male", voiceId: "UaYTS0wayjmO9KD1LR4R", dialect: "British" },
  { key: "africa-female", name: "Amara", description: "English (African) · Female", voiceId: "xh29gsY39TqVRlmqY4AU" },
  { key: "africa-male", name: "Kwame", description: "English (African) · Male", voiceId: "OfkBFhvt6pBj8jdX4jo0" },
  { key: "hindi-female", name: "Priya", description: "Hindi · Female", voiceId: "RDWdsTU6N02BFftbIEAp", language: "Hindi" },
  { key: "hindi-male", name: "Arjun", description: "Hindi · Male", voiceId: "EYuRJHRGEiUhUtCLc33A", language: "Hindi" },
  // Marathi isn't covered by the fast model, so these two use the wider (slower) one.
  { key: "marathi-female", name: "Mrunal", description: "Marathi · Female", voiceId: "InNx4AiWe8WRB9Cskv9F", language: "Marathi", model: "eleven_v3" },
  { key: "marathi-male", name: "Sameer", description: "Marathi · Male", voiceId: "DMH3HSvjBBxypdmxNDkw", language: "Marathi", model: "eleven_v3" },
  { key: "spanish-female", name: "Lucía", description: "Spanish · Female", voiceId: "rEVYTKPqwSMhytFPayIb", language: "Spanish" },
  { key: "spanish-male", name: "Leo", description: "Spanish · Male", voiceId: "G4IAP30yc6c1gK0csDfu", language: "Spanish" },
  { key: "portuguese-female", name: "Beatriz", description: "Portuguese · Female", voiceId: "iScHbNW8K33gNo3lGgbo", language: "Portuguese" },
  { key: "portuguese-male", name: "Chris", description: "Portuguese · Male", voiceId: "0YziWIrqiRTHCxeg1lyc", language: "Portuguese" },
  { key: "arabic-female", name: "Layla", description: "Arabic · Female", voiceId: "FZeLZd39ejvLgzR2gY0t", language: "Arabic" },
  { key: "arabic-male", name: "Mohammed", description: "Arabic · Male", voiceId: "rpGHcNQJvO8dFNNFNj1v", language: "Arabic" },
  { key: "chinese-female", name: "Mei", description: "Chinese · Female", voiceId: "9lHjugDhwqoxA5MhX0az", language: "Chinese (Simplified, Mandarin)" },
  { key: "chinese-male", name: "Wei", description: "Chinese · Male", voiceId: "ZJsn5HnrE3eUbep2ia8D", language: "Chinese (Simplified, Mandarin)" },
];

/** Picker descriptions for voices that are added through the environment rather than built in. */
const EXTRA_DESCRIPTIONS: Record<string, string> = {
  arthur: "English (Southern US) · Male",
  ivanna: "English (Eastern European) · Female",
};

const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;
const VOICE_VAR = /^ELEVENLABS_VOICE_ID_([A-Z0-9]+(?:_[A-Z0-9]+)*)$/;
const MAX_CHARACTERS = 40;

/** Every voice on offer, with its voice ID: the built-in ones, then any added in the environment. Server-side only. */
function voices(): Voice[] {
  const extra: Voice[] = [];
  for (const [variable, value] of Object.entries(process.env)) {
    const match = VOICE_VAR.exec(variable);
    const voiceId = (value ?? "").trim();
    if (!match || !VOICE_ID.test(voiceId)) continue;
    const words = match[1].toLowerCase().split("_");
    const key = words.join("-");
    extra.push({ key, name: words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" "), voiceId, ...(EXTRA_DESCRIPTIONS[key] ? { description: EXTRA_DESCRIPTIONS[key] } : {}) });
  }
  extra.sort((a, b) => a.name.localeCompare(b.name));
  const single = (process.env.ELEVENLABS_VOICE_ID ?? "").trim();
  if (VOICE_ID.test(single)) extra.unshift({ key: "default", name: "Default", voiceId: single });
  const taken = new Set(extra.map((voice) => voice.key));
  const found = [...BUILT_IN_VOICES.filter((voice) => !taken.has(voice.key)), ...extra];

  const preferred = (process.env.ELEVENLABS_DEFAULT_VOICE ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  const first = found.findIndex((voice) => voice.key === preferred);
  if (first > 0) found.unshift(...found.splice(first, 1));
  return found.slice(0, MAX_CHARACTERS);
}

/** The characters a learner can choose between, first one being the default. Never includes voice IDs. */
export function ttsCharacters(): TtsCharacter[] {
  return voices().map(({ key, name, description }) => ({ key, name, ...(description ? { description } : {}) }));
}

const pick = (character: unknown): Voice => {
  const all = voices();
  return all.find((voice) => voice.key === character) ?? all[0];
};

/** A character's display name, or null when it isn't a character on this server. */
export function ttsCharacterName(character: unknown): string | null {
  return voices().find((voice) => voice.key === character)?.name ?? null;
}

/** The voice ID for a character; an unknown or missing one gets the default character. */
export function ttsVoiceId(character?: unknown): string {
  return pick(character).voiceId;
}

/** How a character talks, when it has a manner of its own. Kept short: it is added to every chat request. */
const BUILT_IN_STYLES: Record<string, string> = {
  arthur:
    "a plain-spoken cowboy of the old American West, warm and unhurried. Sprinkle in a little Western and Southern US vocabulary: \"howdy\", \"partner\", \"reckon\", \"y'all\", \"much obliged\", \"ain't\", and the odd trail or ranch comparison",
};
const STYLE_MAX_CHARS = 400;

/**
 * How replies should be worded for a chosen character, or null when it needs nothing special:
 * a manner of speaking (style), the language the voice speaks, or a regional English (dialect).
 */
export function ttsCharacterStyle(character: unknown): { name: string; style?: string; language?: string; dialect?: string; gender?: "female" | "male" } | null {
  const found = voices().find((voice) => voice.key === character);
  if (!found) return null;
  const custom = (process.env[`ELEVENLABS_VOICE_STYLE_${found.key.toUpperCase().replace(/-/g, "_")}`] ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, STYLE_MAX_CHARS);
  const style = custom || BUILT_IN_STYLES[found.key] || "";
  if (!style && !found.language && !found.dialect) return null;
  return { name: found.name, ...(style ? { style } : {}), ...(found.language ? { language: found.language } : {}), ...(found.dialect ? { dialect: found.dialect } : {}), ...(found.language && /-(female|male)$/.test(found.key) ? { gender: found.key.endsWith("-female") ? "female" as const : "male" as const } : {}) };
}

/** The model that speaks for a character: its own when it needs one, otherwise the configured default. */
export function ttsModel(character?: unknown): string {
  const own = pick(character).model;
  if (own) return own;
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
