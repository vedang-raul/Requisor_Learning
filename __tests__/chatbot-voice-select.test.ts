import { createElement, type ChangeEvent, type SelectHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatbotVoiceSelect } from "@/components/chatbot-voice-select";
import type { PublicSpeechVoice } from "@/lib/speech-types";

const voices: PublicSpeechVoice[] = Array.from({ length: 18 }, (_, index) => ({
  key: `voice-${index}`, name: `Voice ${index}`, gender: index % 2 ? "female" : "male",
  languages: ["en"], enabled: index !== 17, default: index === 0,
  unavailableReason: index === 17 ? "Unavailable" : null,
}));

describe("compact chatbot voice dropdown", () => {
  it("renders all configured voices with the current selection and no voice-card dialog", () => {
    const html = renderToStaticMarkup(createElement(ChatbotVoiceSelect, {
      voices, selectedVoiceKey: "voice-4", onSelectVoice: jest.fn(),
    }));
    expect(html).toContain('aria-label="Chatbot voice"');
    expect(html.match(/<option /g)).toHaveLength(18);
    expect(html).toMatch(/value="voice-4" selected=""/);
    expect(html).toContain("Voice 0 (default)");
    expect(html).toMatch(/value="voice-17" disabled=""/);
    expect(html).not.toContain('role="dialog"');
  });
  it("selects enabled voices but ignores unavailable or forged values", () => {
    const onSelectVoice = jest.fn();
    const element = ChatbotVoiceSelect({ voices, selectedVoiceKey: "voice-0", onSelectVoice });
    const props = element.props as SelectHTMLAttributes<HTMLSelectElement>;
    for (const value of ["voice-3", "voice-17", "unknown"]) {
      props.onChange?.({ target: { value } } as ChangeEvent<HTMLSelectElement>);
    }
    expect(onSelectVoice.mock.calls).toEqual([["voice-3"]]);
  });
  it("shows a disabled, labelled dropdown when no voices are available", () => {
    const html = renderToStaticMarkup(createElement(ChatbotVoiceSelect, {
      voices: [], selectedVoiceKey: "", onSelectVoice: jest.fn(),
    }));
    expect(html).toMatch(/<select[^>]*disabled=""/);
    expect(html).toContain("No voices");
  });
});
