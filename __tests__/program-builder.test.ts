import {
  analyzeTranscript, buildProposal, composeCurriculum, EMPTY_DISCOVERY, mergeAiCurriculum, reqiReply, REQI_GREETING, SAMPLE_TRANSCRIPT, sampleDiscovery,
  type Discovery, type ReqiState,
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

  it("lets Reqi run an interview from topic to a built curriculum and proposal", () => {
    let state: ReqiState = REQI_GREETING.state;
    let form: Discovery = EMPTY_DISCOVERY;
    const say = (message: string, hasCurriculum = false) => {
      const turn = reqiReply(state, message, form, hasCurriculum);
      state = turn.state;
      form = { ...form, ...turn.form };
      return turn;
    };
    expect(say("I'll describe it").state).toBe("topic");
    expect(say("a course on AI for hospital scheduling").state).toBe("audience");
    expect(form.topic).toBe("AI For Hospital Scheduling");
    expect(form.industry).toBe("healthcare");
    say("our ward managers");
    expect(form.audience).toBe("ward managers");
    say("beginner");
    expect(form.level).toBe("Beginner");
    say("rosters take too long, handovers are inconsistent");
    expect(form.pains.split("\n")).toHaveLength(2);
    const confirm = say("5");
    expect(form.modules).toBe(5);
    expect(confirm.state).toBe("confirm");
    expect(confirm.quick).toContain("Build it");
    expect(say("audience is charge nurses").form).toEqual({ audience: "charge nurses" });
    expect(say("6 modules").form).toEqual({ modules: 6 });
    expect(say("level is advanced").form).toEqual({ level: "Advanced" });
    expect(say("Build it").effect).toBe("build");
    expect(say("Create the proposal", true).effect).toBe("proposal");
    expect(say("Back to curriculum", true).effect).toBe("curriculum");
    // No proposal before there is a curriculum.
    expect(reqiReply("confirm", "Create the proposal", form, false).effect).toBeUndefined();
  });

  it("lets Reqi take the sample call or a pasted transcript in one step", () => {
    const sample = reqiReply("topic", "Use the sample call", EMPTY_DISCOVERY, false);
    expect(sample.state).toBe("confirm");
    expect(sample.form?.employer).toMatch(/sample/);
    const pasted = reqiReply("topic", SAMPLE_TRANSCRIPT.replace("Concap", "a recorder"), EMPTY_DISCOVERY, false);
    expect(pasted.state).toBe("confirm");
    expect(pasted.form?.industry).toBe("construction");
    expect(pasted.form?.transcript).toContain("Discovery call");
  });
});
