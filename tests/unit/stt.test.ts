import { audioUpload, cleanTranscript, livePreview, micErrorMessage, sttConfigured, sttModel } from "@/lib/ai/stt";

describe("voice input transcription", () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it("is available only with an ElevenLabs key, and uses the configured model", () => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_STT_MODEL;
    expect(sttConfigured()).toBe(false);
    expect(sttModel()).toBe("scribe_v2");
    process.env.ELEVENLABS_API_KEY = "key";
    process.env.ELEVENLABS_STT_MODEL = " scribe_v1 ";
    expect(sttConfigured()).toBe(true);
    expect(sttModel()).toBe("scribe_v1");
  });

  it("accepts what browsers record and rejects anything else", () => {
    expect(audioUpload("audio/webm;codecs=opus")).toEqual({ type: "audio/webm", name: "speech.webm" });
    expect(audioUpload("Audio/MP4")).toEqual({ type: "audio/mp4", name: "speech.m4a" });
    expect(audioUpload("audio/ogg; codecs=opus")).toEqual({ type: "audio/ogg", name: "speech.ogg" });
    expect(audioUpload("application/json")).toBeNull();
    expect(audioUpload("text/html")).toBeNull();
    expect(audioUpload(null)).toBeNull();
  });

  it("turns a transcript into a clean chat message", () => {
    expect(cleanTranscript("  What is   a KPI ?  ")).toBe("What is a KPI?");
    expect(cleanTranscript("(laughter) How does XP work? [music]")).toBe("How does XP work?");
    expect(cleanTranscript("")).toBe("");
    expect(cleanTranscript(undefined)).toBe("");
    expect(cleanTranscript("a".repeat(5000))).toHaveLength(2000);
  });

  it("shows the words heard so far without repeating them", () => {
    expect(livePreview(["what is", " a KPI"])).toBe("what is a KPI");
    expect(livePreview(["how", "how does", "how does XP work"])).toBe("how does XP work");
    expect(livePreview(["  ", ""])).toBe("");
    expect(livePreview([])).toBe("");
  });

  it("explains why the microphone could not be opened", () => {
    expect(micErrorMessage("NotAllowedError")).toMatch(/blocked/);
    expect(micErrorMessage("NotFoundError")).toMatch(/No microphone/);
    expect(micErrorMessage("NotReadableError")).toMatch(/in use/);
    expect(micErrorMessage(undefined)).toMatch(/couldn't be started/);
  });
});
