import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatbotVoiceSelect } from "@/components/chatbot-voice-select";
import type { PublicSpeechVoice } from "@/lib/courses/speech-types";

const voices: PublicSpeechVoice[] = Array.from({ length: 18 }, (_, index) => ({
  key: `voice-${index}`,
  name: `Voice ${index}`,
  gender: index % 2 ? "female" : "male",
  languages: ["en"],
  enabled: index !== 17,
  default: index === 0,
  unavailableReason: index === 17 ? "Unavailable" : null,
}));

describe("compact chatbot voice dropdown", () => {
  it("keeps the selected voice apparent in a compact, labelled listbox trigger", () => {
    const html = renderToStaticMarkup(createElement(ChatbotVoiceSelect, {
      voices,
      selectedVoiceKey: "voice-4",
      onSelectVoice: jest.fn(),
    }));

    expect(html).toContain('aria-label="Chatbot voice: Voice 4, English, male"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(">Voice 4</span>");
    expect(html).not.toContain('role="dialog"');
  });

  it("renders an inert, clearly labelled trigger when no voices are available", () => {
    const html = renderToStaticMarkup(createElement(ChatbotVoiceSelect, {
      voices: [],
      selectedVoiceKey: "",
      onSelectVoice: jest.fn(),
    }));

    expect(html).toContain('aria-label="Choose chatbot voice"');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain("No voices");
    expect(html).toContain('aria-haspopup="listbox"');
  });
});
