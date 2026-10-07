import { checkJobTitle, stripJobTitle } from "@/lib/job-title";

describe("job title", () => {
  it("accepts real titles, in any language", () => {
    for (const title of ["Student", "Software Engineer", "Vice-President, R&D", "Élève infirmière", "Sr. Product Manager (Growth)", "विद्यार्थी", "Teacher / Coach"]) {
      expect(checkJobTitle(title)).toEqual({ ok: true, value: title });
    }
    expect(checkJobTitle("  Data   Analyst ")).toEqual({ ok: true, value: "Data Analyst" });
  });

  it("refuses numbers, symbols and injection attempts", () => {
    for (const bad of [
      "12345", "Engineer 2", "x9", "'; DROP TABLE users; --", "Robert'); DELETE FROM users;--", "admin\" OR \"1\"=\"1",
      "<script>alert(1)</script>", "Engineer ') DROP TABLE users-- b", "Manager--","manager=1", "dev@company", "a", "--", "%27 OR 1=1", "Engineer\nBcc: someone",
    ]) {
      expect(checkJobTitle(bad).ok).toBe(false);
    }
    expect(checkJobTitle(42).ok).toBe(false);
    expect(checkJobTitle("x".repeat(81)).ok).toBe(false);
  });

  it("treats an empty value as 'not given', leaving whether it is required to the form", () => {
    expect(checkJobTitle("")).toEqual({ ok: true, value: "" });
    expect(checkJobTitle("   ")).toEqual({ ok: true, value: "" });
    expect(checkJobTitle(undefined)).toEqual({ ok: true, value: "" });
  });

  it("strips what can't be typed, as the person types", () => {
    expect(stripJobTitle("Engineer 2 <b>")).toBe("Engineer b");
    expect(stripJobTitle("'; DROP TABLE users; --")).toBe("' DROP TABLE users --");
    expect(stripJobTitle("Data Science — MIT 2024")).toBe("Data Science — MIT ");
  });
});
