import { lessonBrief } from "@/lib/courses/lesson-brief";

describe("lessonBrief", () => {
  it("drafts the AI note from the lesson's title, section and description", () => {
    expect(lessonBrief("Reading AI output", "Module 1: Foundations", "Verification as a  habit.\n")).toBe("Reading AI output (Module 1: Foundations): Verification as a habit.");
    expect(lessonBrief("Only a title", "", "")).toBe("Only a title");
    expect(lessonBrief("", "", "Just a description")).toBe("Just a description");
    expect(lessonBrief("", "", "")).toBe("");
    expect(lessonBrief("T", "", "x".repeat(900))).toHaveLength(600);
    expect(lessonBrief("Same", "", "Same")).toBe("Same");
  });

  it("says a title repeated in the description once", () => {
    expect(lessonBrief("How LLMs behave", "Module 1", "Mental models before tools. How LLMs behave")).toBe("How LLMs behave (Module 1): Mental models before tools.");
  });
});
