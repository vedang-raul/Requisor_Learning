import { speechText, ttsCharacters, ttsConfigured, ttsModel, ttsVoiceId, TTS_MAX_CHARS } from "@/lib/tts";

describe("assistant voice", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("is off without a key and falls back to defaults for bad settings", () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(ttsConfigured()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "test-key";
    expect(ttsConfigured()).toBe(true);
    for (const name of Object.keys(process.env)) if (name.startsWith("ELEVENLABS_VOICE_ID")) delete process.env[name];
    process.env.ELEVENLABS_VOICE_ID = "../../v1/user";
    process.env.ELEVENLABS_MODEL = "bad model!";
    expect(ttsVoiceId()).toMatch(/^[A-Za-z0-9]{10,40}$/);
    expect(ttsModel()).toBe("eleven_flash_v2_5");
    process.env.ELEVENLABS_VOICE_ID = "AbCdEf1234567890";
    expect(ttsVoiceId()).toBe("AbCdEf1234567890");
  });

  it("offers one character per ELEVENLABS_VOICE_ID_<NAME> line, without exposing voice IDs", () => {
    for (const name of Object.keys(process.env)) if (name.startsWith("ELEVENLABS_VOICE_ID") || name === "ELEVENLABS_DEFAULT_VOICE") delete process.env[name];
    expect(ttsCharacters()).toEqual([{ key: "default", name: "Default" }]);
    process.env.ELEVENLABS_VOICE_ID_IVANNA = "IvannaVoice12345";
    process.env.ELEVENLABS_VOICE_ID_UNCLE_SAM = "UncleSamVoice123";
    process.env.ELEVENLABS_VOICE_ID_BROKEN = "not a voice id!";
    expect(ttsCharacters()).toEqual([{ key: "ivanna", name: "Ivanna" }, { key: "uncle-sam", name: "Uncle Sam" }]);
    expect(ttsVoiceId("uncle-sam")).toBe("UncleSamVoice123");
    expect(ttsVoiceId("nobody")).toBe("IvannaVoice12345");
    expect(ttsVoiceId(undefined)).toBe("IvannaVoice12345");
    process.env.ELEVENLABS_DEFAULT_VOICE = "Uncle Sam";
    expect(ttsCharacters()[0]).toEqual({ key: "uncle-sam", name: "Uncle Sam" });
    expect(ttsVoiceId()).toBe("UncleSamVoice123");
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
