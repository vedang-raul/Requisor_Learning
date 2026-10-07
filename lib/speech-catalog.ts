import type { ApprovedSpeechKey, PublicSpeechVoice, SpeechCatalogResponse } from "./speech-types";

// Fixed, non-personal platform phrases. Never resolve chat,
// course content, model output, tools or user-authored text into this catalog.
const CONTENT: Readonly<Record<ApprovedSpeechKey, string>> = Object.freeze({
  preview: "Hello. This is a sample of the platform guide voice.",
  platform_help: "Open My Learning to browse courses. Select a lesson to read its material and view available activities.",
  study_tip: "Take a short break between study sessions. Review key ideas, then practise explaining them in your own words.",
});
const MARATHI_CONTENT: Readonly<Record<ApprovedSpeechKey, string>> = Object.freeze({
  preview: "नमस्कार. हा तुमच्या शिक्षण सहाय्यकाच्या आवाजाचा नमुना आहे.",
  platform_help: "अभ्यासक्रम पाहण्यासाठी माय लर्निंग उघडा. अभ्यास साहित्य वाचण्यासाठी आणि उपलब्ध उपक्रम पाहण्यासाठी एखादा धडा निवडा.",
  study_tip: "अभ्यास करताना अधूनमधून थोडी विश्रांती घ्या. महत्त्वाच्या मुद्द्यांची उजळणी करा आणि ते स्वतःच्या शब्दांत समजावून सांगण्याचा सराव करा.",
});

export function getSpeechLanguage(languages: string[]): "en" | "mr" | null {
  for (const language of languages) {
    const base = language.split("-")[0];
    if (base === "en" || base === "mr") return base;
  }
  return null;
}

export function resolveSpeechContent(key: unknown, language: string = "en"): string | null {
  const content = language === "en" ? CONTENT : language === "mr" ? MARATHI_CONTENT : null;
  return content && typeof key === "string" && Object.prototype.hasOwnProperty.call(content, key)
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
      : !getSpeechLanguage(v.languages) ? "Approved speech is currently available in English and Marathi only."
      : null;
    return {
      key: v.key, name: v.name, gender: v.gender, languages: v.languages,
      enabled: unavailableReason === null, default: v.default, unavailableReason,
    };
  });
  return { configured, voices, setupMessage: voices.some(v => v.enabled) ? null : SETUP };
}
