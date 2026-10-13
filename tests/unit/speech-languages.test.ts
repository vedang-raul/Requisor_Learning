import { getSpeechLanguage, SPEECH_LANGUAGES } from "@/lib/courses/speech-languages";
import { resolveSpeechContent } from "@/lib/courses/speech-catalog";

describe("supported narration languages", () => {
  it.each(Object.keys(SPEECH_LANGUAGES))("resolves fixed preview phrases in %s", language => {
    expect(getSpeechLanguage([language])).toBe(language);
    for (const key of ["preview", "platform_help", "study_tip"]) {
      expect(resolveSpeechContent(key, language)).toEqual(expect.any(String));
      expect(resolveSpeechContent(key, language)?.length).toBeGreaterThan(0);
    }
  });
  it("preserves regional English voice selection and server-owned language order", () => {
    expect(getSpeechLanguage(["en-GB"])).toBe("en");
    expect(getSpeechLanguage(["en-US"])).toBe("en");
    expect(getSpeechLanguage(["hi", "en"])).toBe("hi");
    expect(getSpeechLanguage(["xx", "af"])).toBe("af");
  });
  it("rejects unsupported codes and metadata or prototype keys as spoken phrases", () => {
    expect(getSpeechLanguage(["eng", "xx", "__proto__"])).toBeNull();
    for (const language of Object.keys(SPEECH_LANGUAGES)) {
      expect(resolveSpeechContent("name", language)).toBeNull();
      expect(resolveSpeechContent("__proto__", language)).toBeNull();
      expect(resolveSpeechContent("pattern", language)).toBeNull();
    }
  });
});
