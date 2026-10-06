import { followSpeech, normalizeWord, parseScript, wordsMatch } from "@/lib/teleprompter";

const heard = (text: string) => text.split(/\s+/).map(normalizeWord).filter(Boolean);

describe("teleprompter script", () => {
  it("splits a script into headings, notes and spoken words", () => {
    const { blocks, words } = parseScript("# Cold Open 0:00\nLet me show you\nsomething weird.\n> SCREEN\nIt has no idea.\n\n# Next");
    expect(blocks).toEqual([
      { kind: "heading", text: "Cold Open", time: "0:00", at: 0 },
      { kind: "say", words: ["Let", "me", "show", "you", "something", "weird."], at: 0 },
      { kind: "cue", text: "SCREEN", at: 6 },
      { kind: "say", words: ["It", "has", "no", "idea."], at: 6 },
      { kind: "heading", text: "Next", time: null, at: 10 },
    ]);
    expect(words).toHaveLength(10);
  });
});

describe("following the speaker", () => {
  const script = heard("Let me show you something weird. I'm going to ask one of the smartest AI models on the planet a question a five year old could answer");

  it("lands just after the newest words heard, ignoring punctuation and case", () => {
    expect(followSpeech(script, 0, heard("let me show"))).toBe(3);
    expect(followSpeech(script, 3, heard("me show You something WEIRD"))).toBe(6);
  });

  it("works from the recogniser's rolling tail, where older words are already behind the position", () => {
    // position is after "show"; the tail still starts with words already lit
    expect(followSpeech(script, 3, heard("let me show you"))).toBe(4);
  });

  it("stays put for words that aren't in the script", () => {
    expect(followSpeech(script, 3, heard("um so basically"))).toBe(3);
  });

  it("catches up when tracking has fallen well behind", () => {
    // still at word 3, but the speaker is already at "...models on the planet"
    expect(followSpeech(script, 3, heard("models on the planet"))).toBe(19);
  });

  it("doesn't leap ahead on a lone common word or a tiny two-word phrase", () => {
    const repeated = heard("we start here and then much later we look at one of the results of the test");
    expect(followSpeech(repeated, 1, heard("the"))).toBe(1);
    expect(followSpeech(repeated, 1, heard("of the"))).toBe(1);
  });

  it("forgives what recognition gets slightly wrong", () => {
    expect(wordsMatch("five", "5")).toBe(true);
    expect(wordsMatch("model", "models")).toBe(true);
    expect(wordsMatch("it's", "its")).toBe(true);
    expect(wordsMatch("photograph", "photograf")).toBe(true);
    expect(wordsMatch("cat", "car")).toBe(false);
    expect(wordsMatch("planet", "question")).toBe(false);
    // "a 5 year old" heard for "a five year old"
    expect(followSpeech(script, 20, heard("question a 5 year old"))).toBe(25);
  });

  it("gets past a word the recogniser can't get right, using the words around it", () => {
    const line = heard("Think of it like a brief you would hand to a new colleague on their first day. If the brief is vague");
    const colleague = line.indexOf("colleague");
    expect(wordsMatch("colleague", "college")).toBe(true);
    expect(wordsMatch("their", "there")).toBe(true);
    // heard as a sound-alike
    expect(followSpeech(line, colleague, heard("to a new college"))).toBe(colleague + 1);
    // heard as something unrecognisable: the surrounding words carry it
    expect(followSpeech(line, colleague, heard("to a new call egg"))).toBe(colleague);
    expect(followSpeech(line, colleague, heard("a new kaliko on"))).toBe(colleague + 2);
    expect(followSpeech(line, colleague, heard("new kaliko on there first"))).toBe(colleague + 4);
  });

  it("never moves backwards and stops at the end", () => {
    expect(followSpeech(script, 6, heard("let me show"))).toBe(6);
    expect(followSpeech(script, script.length - 2, heard("old could answer"))).toBe(script.length);
  });

  it("steps over script words with nothing to say, like a lone dash", () => {
    const dashed = heard("not because it's dumb").concat("", heard("because of when it was born"));
    expect(followSpeech(dashed, 3, heard("dumb because of"))).toBe(7);
  });
});
