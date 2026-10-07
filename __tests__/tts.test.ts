import { speechText, ttsCharacterStyle, ttsCharacters, ttsConfigured, ttsModel, ttsVoiceId, TTS_MAX_CHARS } from "@/lib/tts";

describe("assistant voice", () => {
  const env = { ...process.env };
  beforeEach(() => {
    for (const name of Object.keys(process.env)) if (name.startsWith("ELEVENLABS_")) delete process.env[name];
  });
  afterEach(() => { process.env = { ...env }; });

  it("is off without a key", () => {
    expect(ttsConfigured()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "test-key";
    expect(ttsConfigured()).toBe(true);
  });

  it("offers the built-in voices, with a default, and never exposes voice IDs", () => {
    const voices = ttsCharacters();
    expect(voices).toHaveLength(18);
    expect(voices[0]).toEqual({ key: "english-america-female", name: "Grace", description: "English (US) · Female" });
    expect(new Set(voices.map((v) => v.key)).size).toBe(18);
    expect(JSON.stringify(voices)).not.toMatch(/voiceId/);
    expect(ttsVoiceId()).toBe(ttsVoiceId("english-america-female"));
    expect(ttsVoiceId("nobody")).toBe(ttsVoiceId());
    expect(ttsVoiceId("hindi-male")).not.toBe(ttsVoiceId());
  });

  it("adds a character per ELEVENLABS_VOICE_ID_<NAME> line and honours the chosen default", () => {
    process.env.ELEVENLABS_VOICE_ID_UNCLE_SAM = "UncleSamVoice123";
    process.env.ELEVENLABS_VOICE_ID_BROKEN = "not a voice id!";
    const voices = ttsCharacters();
    expect(voices).toHaveLength(19);
    expect(voices[18]).toEqual({ key: "uncle-sam", name: "Uncle Sam" });
    expect(ttsVoiceId("uncle-sam")).toBe("UncleSamVoice123");
    process.env.ELEVENLABS_DEFAULT_VOICE = "Uncle Sam";
    expect(ttsCharacters()[0]).toEqual({ key: "uncle-sam", name: "Uncle Sam" });
    expect(ttsVoiceId()).toBe("UncleSamVoice123");
  });

  it("uses the default model unless a voice needs its own, and ignores a bad setting", () => {
    expect(ttsModel()).toBe("eleven_flash_v2_5");
    expect(ttsModel("marathi-female")).toBe("eleven_v3");
    process.env.ELEVENLABS_MODEL = "bad model!";
    expect(ttsModel("hindi-male")).toBe("eleven_flash_v2_5");
    process.env.ELEVENLABS_MODEL = "eleven_multilingual_v2";
    expect(ttsModel("hindi-male")).toBe("eleven_multilingual_v2");
  });

  it("says how replies should be worded for a voice: its language, dialect or manner", () => {
    expect(ttsCharacterStyle("english-america-female")).toBeNull();
    expect(ttsCharacterStyle("hindi-female")).toEqual({ name: "Priya", language: "Hindi", gender: "female" });
    expect(ttsCharacterStyle("english-british-male")).toEqual({ name: "Jhon", dialect: "British" });
    expect(ttsCharacterStyle("arthur")).toBeNull();
    expect(ttsCharacterStyle({})).toBeNull();
    process.env.ELEVENLABS_VOICE_ID_ARTHUR = "ArthurVoice12345";
    expect(ttsCharacterStyle("arthur")?.style).toMatch(/howdy/);
    process.env.ELEVENLABS_VOICE_STYLE_ARTHUR = "  a calm <b>teacher</b>\nfrom Kyiv  ";
    expect(ttsCharacterStyle("arthur")).toEqual({ name: "Arthur", style: "a calm b teacher /b from Kyiv" });
  });

  it("speaks plain text and cuts a long reply at the end of a sentence", () => {
    expect(speechText("  Hello\n\nthere.  ")).toBe("Hello there.");
    expect(speechText(42)).toBe("");
    const long = "This is one sentence. ".repeat(200);
    const cut = speechText(long);
    expect(cut.length).toBeLessThanOrEqual(TTS_MAX_CHARS);
    expect(cut.endsWith("sentence.")).toBe(true);
  });
});
