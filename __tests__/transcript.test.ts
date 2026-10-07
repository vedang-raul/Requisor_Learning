import { cleanTranscript, formatClock, transcriptForAi, TRANSCRIPT_AI_CHARS } from "@/lib/transcript";

describe("lesson transcripts", () => {
  it("reads YouTube's pasted transcript, grouping lines into passages", () => {
    const pasted = "0:00\nWelcome back.\n0:05\nToday: agents.\n0:40\nAutomation follows rules.\n1:15\nAgents pursue goals.";
    expect(cleanTranscript(pasted)).toBe("[0:00] Welcome back. Today: agents.\n[0:40] Automation follows rules.\n[1:15] Agents pursue goals.");
  });

  it("reads WebVTT and SRT, dropping headers, cue numbers, tags and repeated lines", () => {
    const vtt = "WEBVTT\nKind: captions\nLanguage: en\n\nNOTE made by a tool\nignore me\n\n1\n00:00:01.000 --> 00:00:04.000\n<c>Hello</c> &amp; welcome\n\n2\n00:00:04.000 --> 00:00:06.000\nHello & welcome\n\n3\n00:01:02,500 --> 00:01:05,000\nSecond part";
    expect(cleanTranscript(vtt)).toBe("[0:01] Hello & welcome\n[1:02] Second part");
  });

  it("keeps plain text as it is, and timestamps written on the same line", () => {
    expect(cleanTranscript("Just a paragraph.\n\nAnother one.")).toBe("Just a paragraph.\nAnother one.");
    expect(cleanTranscript("[1:02:03] Late in a long video\n(1:02:50) still there")).toBe("[1:02:03] Late in a long video\n[1:02:50] still there");
  });

  it("returns nothing for empty or non-text input", () => {
    expect(cleanTranscript("")).toBe("");
    expect(cleanTranscript("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\n")).toBe("");
    expect(cleanTranscript(42)).toBe("");
  });

  it("formats times and cuts long transcripts at a line break for the assistant", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3723)).toBe("1:02:03");
    const long = Array.from({ length: 2000 }, (_, i) => `[${formatClock(i * 30)}] ${"word ".repeat(8).trim()}`).join("\n");
    const cut = transcriptForAi(long);
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(TRANSCRIPT_AI_CHARS);
    expect(long.startsWith(cut.text + "\n")).toBe(true);
    expect(transcriptForAi("short")).toEqual({ text: "short", truncated: false });
  });
});
