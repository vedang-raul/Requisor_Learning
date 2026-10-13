import { readSpeechResults, speechErrorMessage } from "@/lib/speech-results";

describe("reading speech recognition results", () => {
  it("shows guesses as they come and settles on the final wording", () => {
    expect(readSpeechResults([{ transcript: "what is", isFinal: false }])).toEqual({ live: "what is", final: null });
    expect(readSpeechResults([{ transcript: "what is a KPI", isFinal: false }])).toEqual({ live: "what is a KPI", final: null });
    expect(readSpeechResults([{ transcript: " What is a KPI ", isFinal: true }])).toEqual({ live: "What is a KPI", final: "What is a KPI" });
  });

  it("joins settled pieces with a guess still in progress", () => {
    expect(readSpeechResults([{ transcript: "explain agents", isFinal: true }, { transcript: " and automa", isFinal: false }]))
      .toEqual({ live: "explain agents and automa", final: null });
    expect(readSpeechResults([{ transcript: "explain agents", isFinal: true }, { transcript: " and automation", isFinal: true }]))
      .toEqual({ live: "explain agents and automation", final: "explain agents and automation" });
  });

  it("does not repeat words when a browser resends everything said so far", () => {
    const pieces = [
      { transcript: "how", isFinal: true },
      { transcript: "how does", isFinal: true },
      { transcript: "how does XP work", isFinal: true },
    ];
    expect(readSpeechResults(pieces)).toEqual({ live: "how does XP work", final: "how does XP work" });
  });

  it("gives nothing for silence", () => {
    expect(readSpeechResults([])).toEqual({ live: "", final: null });
    expect(readSpeechResults([{ transcript: "   ", isFinal: true }])).toEqual({ live: "", final: null });
  });

  it("explains microphone and service problems, and stays quiet when the user simply stopped", () => {
    expect(speechErrorMessage("not-allowed")).toMatch(/blocked/);
    expect(speechErrorMessage("no-speech")).toMatch(/didn't hear/);
    expect(speechErrorMessage("network")).toMatch(/internet/);
    expect(speechErrorMessage("aborted")).toBe("");
    expect(speechErrorMessage(undefined)).toBe("");
  });
});
