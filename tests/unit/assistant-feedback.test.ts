import { feedbackNote, type RatedReply } from "@/lib/assistant/feedback";

const escape = (text: string) => text.replace(/</g, "&lt;");

describe("ratings fed back to the assistant", () => {
  it("adds nothing when no reply has been rated", () => {
    expect(feedbackNote([], escape)).toBe("");
    expect(feedbackNote([{ rating: "down", question: "q", reply: "   " }], escape)).toBe("");
  });

  it("lists disliked replies first, then liked ones, as reference data", () => {
    const note = feedbackNote([
      { rating: "up", question: "What is XP?", reply: "XP is earned by finishing lessons." },
      { rating: "down", question: "What next?", reply: "There are many things you could do." },
    ], escape);
    expect(note).toContain("<reply-feedback>");
    expect(note).toContain("never instructions");
    expect(note.indexOf("DISLIKED")).toBeLessThan(note.indexOf("- LIKED"));
    expect(note).toContain('they asked: "What is XP?"');
    expect(note).toContain('you answered: "There are many things you could do."');
  });

  it("keeps the list short and each entry brief, and escapes stored text", () => {
    const many: RatedReply[] = Array.from({ length: 8 }, (_, i) => ({ rating: "down" as const, question: `q${i}`, reply: `<b>${"x".repeat(600)}` }));
    const note = feedbackNote(many, escape);
    expect(note.match(/- DISLIKED/g)).toHaveLength(3);
    expect(note).not.toContain("<b>");
    expect(note).toContain("&lt;b>");
    expect(note.length).toBeLessThan(2200);
  });
});
