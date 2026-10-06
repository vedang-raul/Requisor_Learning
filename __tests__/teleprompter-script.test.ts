import { cleanGeneratedScript, defaultScriptMinutes, parseScript, scriptBrief } from "@/lib/teleprompter";

describe("script request", () => {
  it("needs a lesson title, and trims what it is given", () => {
    expect(scriptBrief({ description: "No title here" })).toBeNull();
    expect(scriptBrief("nope")).toBeNull();
    expect(scriptBrief({ title: "  Prompt basics ", description: "x".repeat(5000), notes: "Start with the bakery example", minutes: 3 })).toMatchObject({
      title: "Prompt basics", notes: "Start with the bakery example", minutes: 3, courseTitle: "", section: "",
    });
    expect(scriptBrief({ title: "T", description: "x".repeat(5000) })!.description).toHaveLength(2000);
  });

  it("only writes the offered lengths, defaulting to fit the lesson (5 minutes at most)", () => {
    expect(scriptBrief({ title: "T", minutes: 8 })!.minutes).toBe(8);
    expect(scriptBrief({ title: "T", minutes: 45 })!.minutes).toBe(5);
    expect(scriptBrief({ title: "T", minutes: 45, lessonMinutes: 2 })!.minutes).toBe(2);
    expect(defaultScriptMinutes(20)).toBe(5);
    expect(defaultScriptMinutes(4)).toBe(3);
    expect(defaultScriptMinutes(null)).toBe(5);
  });
});

describe("tidying the drafted script", () => {
  it("turns model formatting into the teleprompter's plain format", () => {
    const raw = "```text\n## Welcome 0:00\n**Hi everyone**, and welcome back.\n\n\n\n>> Share your screen\n- First, say who it is for.\n* Then say what you want.\n```";
    const script = cleanGeneratedScript(raw);
    expect(script).toBe("# Welcome 0:00\nHi everyone, and welcome back.\n\n> Share your screen\nFirst, say who it is for.\nThen say what you want.");
    const { blocks } = parseScript(script);
    expect(blocks[0]).toMatchObject({ kind: "heading", text: "Welcome", time: "0:00" });
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "say", "cue", "say"]);
  });

  it("returns nothing for a missing or empty reply", () => {
    expect(cleanGeneratedScript(undefined)).toBe("");
    expect(cleanGeneratedScript("   \n ")).toBe("");
  });
});
