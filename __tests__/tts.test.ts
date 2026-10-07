import { speechText, ttsConfigured, ttsModel, ttsVoiceId, TTS_MAX_CHARS } from "@/lib/tts";

describe("assistant voice", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("is off without a key and falls back to defaults for bad settings", () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(ttsConfigured()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "test-key";
    expect(ttsConfigured()).toBe(true);
    process.env.ELEVENLABS_VOICE_ID = "../../v1/user";
    process.env.ELEVENLABS_MODEL = "bad model!";
    expect(ttsVoiceId()).toMatch(/^[A-Za-z0-9]{10,40}$/);
    expect(ttsModel()).toBe("eleven_flash_v2_5");
    process.env.ELEVENLABS_VOICE_ID = "AbCdEf1234567890";
    expect(ttsVoiceId()).toBe("AbCdEf1234567890");
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
