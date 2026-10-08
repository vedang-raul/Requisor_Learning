import {
  analyzeTranscript, buildProposal, cleanDiscoveryFields, composeCurriculum, EMPTY_DISCOVERY, mergeAiCurriculum, readProgramCommand, SAMPLE_TRANSCRIPT, sampleDiscovery,
} from "@/lib/program-builder";

describe("Program Builder", () => {
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
