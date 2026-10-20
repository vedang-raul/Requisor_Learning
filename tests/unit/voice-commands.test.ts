import { classifySpokenAnswer, isStopCommand, isStopUtterance, isWakePhrase, isWakeUtterance, STOP_GRAMMAR, WAKE_GRAMMAR } from "@/lib/accessibility/voice-commands";

describe("spoken answers to a confirmation card", () => {
  it("treats a short yes or no (in several languages) as an answer", () => {
    for (const yes of ["Yes", "yes please", "Yeah.", "OK", "go ahead", "Confirm", "Sí", "oui", "हाँ"]) expect(classifySpokenAnswer(yes)).toBe("yes");
    for (const no of ["No", "no thanks", "Cancel.", "never mind", "nein", "नहीं"]) expect(classifySpokenAnswer(no)).toBe("no");
  });

  it("sends anything longer or different to the assistant as a message", () => {
    expect(classifySpokenAnswer("No, I meant the other lesson")).toBeNull();
    expect(classifySpokenAnswer("yes but change the title first please")).toBeNull();
    expect(classifySpokenAnswer("what's my grade")).toBeNull();
    expect(classifySpokenAnswer("")).toBeNull();
  });
});

describe("ending hands-free mode", () => {
  it("recognises stop phrases, and only whole ones", () => {
    for (const stop of ["Stop", "stop listening", "Goodbye!", "that's all"]) expect(isStopCommand(stop)).toBe(true);
    expect(isStopCommand("how do I stop a process in Linux")).toBe(false);
  });
});

describe("the Hey Requisor wake phrase", () => {
  it("accepts what the on-device recogniser hears for it", () => {
    for (const heard of WAKE_GRAMMAR.filter((g) => g !== "[unk]")) expect(isWakePhrase(heard)).toBe(true);
    expect(isWakePhrase("hey requisor")).toBe(true);
    expect(isWakePhrase("okay requisite can you help")).toBe(true);
  });

  it("ignores everyday speech that merely sounds a bit like it", () => {
    for (const other of ["hey", "hey there", "request", "the requisition form", "a requisite", "hey alexa", "hey recruiter", "[unk]", "hey how are you", ""]) {
      expect(isWakePhrase(other)).toBe(false);
    }
  });
});

// What the on-device recogniser (Vosk, WAKE_GRAMMAR) actually returned for
// spoken test clips, captured in the browser. Only the phrase on its own wakes.
describe("waking on a finished recognition", () => {
  it('wakes for "Hey Requisor" said on its own', () => {
    expect(isWakeUtterance("hey request sir")).toBe(true); // "Hey Requisor!"
    expect(isWakeUtterance("[unk] hey request sir")).toBe(true); // a sound before it
    expect(isWakeUtterance("hey requisite")).toBe(true);
  });

  it("doesn't wake for the decoys", () => {
    expect(isWakeUtterance("hey [unk]")).toBe(false); // "Hey, how are you doing today?"
    expect(isWakeUtterance("hey")).toBe(false);
    expect(isWakeUtterance("a requisite [unk]")).toBe(false); // "The requisition form is due tomorrow."
    expect(isWakeUtterance("[unk] hey request sir [unk]")).toBe(false); // "Hey, request a quiz for me."
    expect(isWakeUtterance("hey request sir [unk] [unk]")).toBe(false); // the phrase, then more speech
    expect(isWakeUtterance("")).toBe(false);
  });
});

describe('interrupting the assistant with "stop"', () => {
  it("hears a stop phrase on its own, even after the assistant's own voice", () => {
    for (const heard of STOP_GRAMMAR) expect(isStopUtterance(heard)).toBe(true);
    expect(isStopUtterance("[unk] stop")).toBe(true);
    expect(isStopUtterance("Stop.")).toBe(true);
  });

  it("ignores stop inside a longer sentence", () => {
    expect(isStopUtterance("stop [unk]")).toBe(false);
    expect(isStopUtterance("how do I stop a process")).toBe(false);
    expect(isStopUtterance("[unk]")).toBe(false);
    expect(isStopUtterance("")).toBe(false);
  });
});
