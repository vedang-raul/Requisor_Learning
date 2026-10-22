import type { ApprovedSpeechKey, PublicSpeechVoice, SpeechCatalogResponse } from "./speech-types";
import { getSpeechLanguage, SPEECH_LANGUAGES } from "./speech-languages";
export { getSpeechLanguage } from "./speech-languages";

/** Fixed preview phrases only; never resolves arbitrary user content. */
export function resolveSpeechContent(key: unknown, language: string = "en"): string | null {
  const supported = getSpeechLanguage([language]);
  const content = supported ? SPEECH_LANGUAGES[supported] : null;
  return content && typeof key === "string" && Object.prototype.hasOwnProperty.call(content, key)
    && ["preview", "platform_help", "study_tip"].includes(key)
    ? content[key as ApprovedSpeechKey] : null;
}

interface ConfigVoice {
  key: string;
  name: string;
  gender: "male" | "female";
  languages: string[];
  voiceId?: string;
  enabled: boolean;
  default: boolean;
}
const UNCONFIGURED: ConfigVoice[] = [
  { key: "female-guide", name: "Female guide", gender: "female", languages: ["en"], enabled: true, default: true },
  { key: "male-guide", name: "Male guide", gender: "male", languages: ["en"], enabled: true, default: false },
];
const SETUP = "Ask the platform owner to configure ELEVENLABS_VOICES with supplied voice IDs and add ELEVENLABS_API_KEY in Secrets.";

/** Read runtime configuration, with no invented provider IDs or network lookup. */
export function getSpeechCatalog(): SpeechCatalogResponse & { configured: ConfigVoice[] } {
  let configured = UNCONFIGURED;
  const raw = process.env.ELEVENLABS_VOICES;
  if (raw) {
    try {
      if (raw.length > 16_384) throw new Error("config_size");
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 20) throw new Error("config_shape");
      const keys = new Set<string>();
      let defaults = 0;
      configured = parsed.map((v: unknown): ConfigVoice => {
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("config_entry");
        const c = v as Record<string, unknown>;
        if (Object.keys(c).some(k => !["key", "name", "gender", "languages", "voiceId", "enabled", "default"].includes(k))
          || typeof c.key !== "string" || !/^[a-z][a-z0-9-]{0,47}$/.test(c.key) || keys.has(c.key)
          || typeof c.name !== "string" || !c.name.trim() || c.name.length > 80 || /[\u0000-\u001f]/.test(c.name)
          || (c.gender !== "male" && c.gender !== "female")
          || !Array.isArray(c.languages) || c.languages.length < 1 || c.languages.length > 12
          || c.languages.some(l => typeof l !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(l))
          || typeof c.enabled !== "boolean" || typeof c.default !== "boolean"
          || (c.voiceId !== undefined && (typeof c.voiceId !== "string" || !/^[a-zA-Z0-9]{20}$/.test(c.voiceId)))) {
          throw new Error("config_entry");
        }
        keys.add(c.key);
        if (c.default) defaults++;
        return c as unknown as ConfigVoice;
      });
      if (defaults !== 1) throw new Error("config_default");
    } catch {
      return { configured: [], voices: [], setupMessage: `Voice configuration is invalid. ${SETUP}` };
    }
  }
  const voices: PublicSpeechVoice[] = configured.map(v => {
    const unavailableReason = !v.enabled ? "Disabled by the platform owner."
      : !v.voiceId ? "Voice ID not configured."
      : !process.env.ELEVENLABS_API_KEY ? "Speech credentials not configured."
      : !getSpeechLanguage(v.languages) ? "Speech is unavailable for this language."
      : null;
    return {
      key: v.key, name: v.name, gender: v.gender, languages: v.languages,
      enabled: unavailableReason === null, default: v.default, unavailableReason,
    };
  });
  return { configured, voices, setupMessage: voices.some(v => v.enabled) ? null : SETUP };
}
