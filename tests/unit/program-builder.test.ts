import {
  analyzeTranscript, buildProposal, cleanDiscoveryFields, composeCurriculum, EMPTY_DISCOVERY, curriculumGate, mergeAiCurriculum, moveAt, proposalGate, readProgramCommand, refreshProposal, removeAt, renumberModules, stepOpen, SAMPLE_TRANSCRIPT, sampleDiscovery,
  programStorageKey, programDraftSummary, sendProgramCommand, takeProgramCommand, hasProgramCommand, PROGRAM_DRAFT_KEY,
} from "@/lib/courses/program-builder";

describe("Program Builder", () => {
  it("separates browser drafts and queued commands by account", () => {
    const records = new Map<string, string>();
    const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalEvent = Object.getOwnPropertyDescriptor(globalThis, "CustomEvent");
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => records.set(key, value),
      removeItem: (key: string) => records.delete(key),
    } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: jest.fn() } });
    Object.defineProperty(globalThis, "CustomEvent", { configurable: true, value: class {} });
    try {
      const a = "tutor-a@example.test", b = "tutor-b@example.test";
      expect(programStorageKey(PROGRAM_DRAFT_KEY)).toBeNull();
      expect(programStorageKey(PROGRAM_DRAFT_KEY, a)).not.toBe(programStorageKey(PROGRAM_DRAFT_KEY, b));
      records.set(PROGRAM_DRAFT_KEY, JSON.stringify({ form: { topic: "Legacy draft" } }));
      records.set(programStorageKey(PROGRAM_DRAFT_KEY, a)!, JSON.stringify({ form: { topic: "Private draft" } }));
      expect(programDraftSummary(a)?.topic).toBe("Private draft");
      expect(programDraftSummary(b)).toBeNull();
      expect(programDraftSummary()).toBeNull();
      sendProgramCommand({ run: "fill", form: { topic: "Private command" } }, a);
      expect(hasProgramCommand(a)).toBe(true);
      expect(hasProgramCommand(b)).toBe(false);
      expect(takeProgramCommand(b)).toBeNull();
      expect(takeProgramCommand(a)?.form.topic).toBe("Private command");
      expect(takeProgramCommand(a)).toBeNull();
    } finally {
      for (const [key, descriptor] of [
        ["sessionStorage", originalStorage], ["window", originalWindow], ["CustomEvent", originalEvent],
      ] as const) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  });

  it("reads industry, audience, topic, level and pains out of a transcript", () => {
    const found = analyzeTranscript(SAMPLE_TRANSCRIPT);
    expect(found.industry).toBe("construction");
    expect(found.level).toBe("Intermediate");
    expect(found.audience).toBe("construction managers");
    expect(found.topic).toBe("Ai Applications In Pre-construction");
    expect(found.pains?.split("\n").length).toBeGreaterThanOrEqual(2);
    expect(analyzeTranscript("Our credit union wants a course on fraud review for the lending team, they are new to it.")).toMatchObject({ industry: "finance", level: "Beginner" });
    expect(analyzeTranscript("hello").industry).toBe("general");
  });

  it("composes a complete curriculum with the requested number of modules", () => {
    const form = sampleDiscovery(EMPTY_DISCOVERY);
    for (const modules of [3, 4, 5, 6]) {
      const c = composeCurriculum({ ...form, modules });
      expect(c.modules).toHaveLength(modules);
      expect(c.duration).toBe(`${modules} modules · ${modules} weeks`);
    }
    const c = composeCurriculum(form);
    expect(c.title).toBe("AI Applications In Pre-Construction");
    expect(c.outcomes).toHaveLength(4);
    expect(c.audience).toBe("Construction Managers");
    expect(c.format).toBe("Blended");
    expect(c.needLine).toMatch(/identified the following needs/);
    expect(c.modules.every((m) => m.title && m.submodules.length >= 3 && m.activities.length >= 1)).toBe(true);
    // Works from an empty form too.
    const blank = composeCurriculum(EMPTY_DISCOVERY);
    expect(blank.title).toBe("Applied AI For The Organization");
    expect(blank.needLine).toMatch(/seeking practical AI capability/);
    expect(composeCurriculum({ ...EMPTY_DISCOVERY, modules: 99 }).modules).toHaveLength(6);
  });

  it("takes only well-formed parts of an AI answer, keeping the engine's for the rest", () => {
    const base = composeCurriculum(sampleDiscovery(EMPTY_DISCOVERY));
    const mods = [1, 2, 3, 4].map((n) => ({ t: `AI module ${n}`, d: "About it", subs: ["a", "b", "c", "d"], acts: ["x", "y"] }));
    const merged = mergeAiCurriculum(base, { title: "Custom title", desc: "Custom description", outcomes: ["o1", "o2", "o3", "o4"], mods, assess: "Custom assessment", needLine: "Custom need" }, 4);
    expect(merged.title).toBe("Custom title");
    expect(merged.modules.map((m) => m.title)).toEqual(mods.map((m) => m.t));
    expect(merged.delivery).toBe(base.delivery);
    expect(mergeAiCurriculum(base, "not an object", 4)).toBe(base);
    const partial = mergeAiCurriculum(base, { title: "Only a title", mods: [{ t: "One module" }], outcomes: ["just one"] }, 4);
    expect(partial.title).toBe("Only a title");
    expect(partial.modules).toBe(base.modules);
    expect(partial.outcomes).toBe(base.outcomes);
  });

  it("builds the proposal from the curriculum as edited", () => {
    const c = { ...composeCurriculum(sampleDiscovery(EMPTY_DISCOVERY)), title: "Edited Title" };
    const p = buildProposal(c, "  Findorff  ", new Date(2026, 9, 8));
    expect(p.title).toBe("Edited Title");
    expect(p.employer).toBe("Findorff");
    expect(p.date).toBe("October 8, 2026");
    expect(p.modules[0].title).toMatch(/^Module 1: /);
    expect(p.modules[0].summary).toBe(c.modules[0].submodules.join(" · "));
    expect(p.pricing).toHaveLength(3);
    expect(buildProposal(c, "", new Date()).employer).toBe("Employer Partner");
  });

  it("keeps the steps in order: the proposal comes after a curriculum the tutor has in front of them", () => {
    expect([stepOpen(1, false, false), stepOpen(2, false, false), stepOpen(3, false, false)]).toEqual([true, false, false]);
    expect([stepOpen(2, true, false), stepOpen(3, true, false)]).toEqual([true, false]);
    expect(stepOpen(3, true, true)).toBe(true);

    expect(curriculumGate(null)).toMatch(/nothing to build from/i);
    expect(curriculumGate({ topic: "  " })).toMatch(/nothing to build from/i);
    expect(curriculumGate({ topic: "Safety" })).toBeNull();
    expect(curriculumGate({ hasTranscript: true })).toBeNull();
    expect(curriculumGate({ hasCurriculum: true })).toBeNull();

    expect(proposalGate(null)).toMatch(/no curriculum/i);
    expect(proposalGate({ hasCurriculum: false, step: 2 })).toMatch(/no curriculum/i);
    expect(proposalGate({ hasCurriculum: true, step: 1 })).toMatch(/hasn't reached/i);
    expect(proposalGate({ hasCurriculum: true, step: "2" })).toMatch(/hasn't reached/i);
    expect(proposalGate({ hasCurriculum: true, step: 2 })).toBeNull();
    expect(proposalGate({ hasCurriculum: true, hasProposal: true, step: 3 })).toBeNull();
  });

  it("edits lists: removes, moves within bounds, renumbers proposal modules", () => {
    expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
    expect(moveAt(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveAt(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveAt(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(renumberModules([{ title: "Module 3: Risk", summary: "" }, { title: "Own title", summary: "" }]).map((m) => m.title)).toEqual(["Module 1: Risk", "Own title"]);
  });

  it("refreshes a proposal from a changed curriculum without losing what only the proposal holds", () => {
    const c = composeCurriculum({ ...EMPTY_DISCOVERY, topic: "Estimating", employer: "Findorff" });
    const before = {
      ...buildProposal(c, "Findorff", new Date(2026, 9, 8)),
      total: "$12,000",
      preview: { id: 7, url: "https://example.test/p/x", until: "November 20, 2026" },
    };
    const edited = { ...c, title: "Estimating, revised", outcomes: ["One outcome"] };
    const after = refreshProposal(before, edited, "", new Date(2027, 0, 1));
    expect(after).toMatchObject({ title: "Estimating, revised", outcomes: ["One outcome"], total: "$12,000", preview: before.preview, employer: "Findorff", date: before.date });
    expect(refreshProposal(before, edited, "Mortenson", new Date()).employer).toBe("Mortenson");
  });

  it("accepts only real discovery fields in a command from the assistant", () => {
    expect(cleanDiscoveryFields({
      topic: "  AI for hospital scheduling ", audience: "ward managers", employer: "City General", industry: "healthcare", level: "beginner",
      modules: 9, format: "live cohort", pains: ["rosters take too long", "", "handovers are inconsistent"], transcript: "Line one.\nLine two.", role: "admin",
    })).toEqual({
      topic: "AI for hospital scheduling", audience: "ward managers", employer: "City General", industry: "healthcare", level: "Beginner",
      modules: 6, format: "Live cohort", pains: "rosters take too long\nhandovers are inconsistent", transcript: "Line one.\nLine two.",
    });
    expect(cleanDiscoveryFields({ industry: "space", level: "wizard", modules: "4", format: "", topic: 7 })).toEqual({});
    expect(cleanDiscoveryFields(null)).toEqual({});
    expect(readProgramCommand({ run: "generate", form: { topic: "X course" } })).toEqual({ run: "generate", form: { topic: "X course" } });
    expect(readProgramCommand({ run: "delete everything", form: {} })).toBeNull();
    expect(readProgramCommand({ run: "proposal" })).toEqual({ run: "proposal", form: {} });
  });
});
