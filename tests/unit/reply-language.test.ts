import { replyLanguageName } from "@/lib/assistant/personas";

describe("replyLanguageName — the language the assistant must reply in", () => {
  it("names a chosen language in English with its own name, so the model can't misread it", () => {
    expect(replyLanguageName("es")).toBe("Spanish (Español)");
    expect(replyLanguageName("hi")).toBe("Hindi (हिन्दी)");
    expect(replyLanguageName("de")).toBe("German (Deutsch)");
  });

  it("accepts a browser voice's language tag", () => {
    expect(replyLanguageName("fr-FR")).toBe("French (Français)");
    expect(replyLanguageName("pt_BR")).toBe("Portuguese (Português)");
    expect(replyLanguageName("ZH-cn")).toBe("Chinese (Simplified, Mandarin) (中文)");
  });

  it("needs no rule for English, empty or unknown languages", () => {
    expect(replyLanguageName("en")).toBeNull();
    expect(replyLanguageName("en-GB")).toBeNull();
    expect(replyLanguageName("")).toBeNull();
    expect(replyLanguageName(null)).toBeNull();
    expect(replyLanguageName("xx-YY")).toBeNull();
  });
});
