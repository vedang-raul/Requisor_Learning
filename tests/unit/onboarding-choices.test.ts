import { checkJobTitle } from "@/lib/auth/job-title";
import { dateFromParts, joinChoices, LEARNER_BACKGROUNDS, TUTOR_SUBJECTS } from "@/lib/onboarding/choices";

describe("onboarding answers picked instead of typed", () => {
  it("saves the picks, plus anything typed under Other, as one answer", () => {
    expect(joinChoices(["Student", "Finance"])).toBe("Student, Finance");
    expect(joinChoices(["Student"], "  Nursing ")).toBe("Student, Nursing");
    expect(joinChoices([], "Nurse")).toBe("Nurse");
    expect(joinChoices([], "   ")).toBe("");
  });

  it("keeps any three tutor subjects a valid job title (that's where they're saved)", () => {
    for (const a of TUTOR_SUBJECTS) for (const b of TUTOR_SUBJECTS) for (const c of TUTOR_SUBJECTS) {
      if (a === b || b === c || a === c) continue;
      // The longest "Other" text allowed is 30 characters.
      expect(checkJobTitle(joinChoices([a, b], "x".repeat(30))).ok).toBe(true);
      expect(checkJobTitle(joinChoices([a, b, c])).ok).toBe(true);
    }
  });

  it("offers only distinct options", () => {
    expect(new Set(LEARNER_BACKGROUNDS).size).toBe(LEARNER_BACKGROUNDS.length);
    expect(new Set(TUTOR_SUBJECTS).size).toBe(TUTOR_SUBJECTS.length);
  });

  it("builds the date of birth from the three dropdowns, rejecting impossible dates", () => {
    expect(dateFromParts("2001", "4", "15")).toBe("2001-04-15");
    expect(dateFromParts("2000", "2", "29")).toBe("2000-02-29");
    expect(dateFromParts("2001", "2", "29")).toBe("");
    expect(dateFromParts("2001", "4", "31")).toBe("");
    expect(dateFromParts("", "4", "15")).toBe("");
  });
});
