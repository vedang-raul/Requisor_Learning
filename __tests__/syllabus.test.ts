import { blankSyllabus, cleanSyllabus, gradingShares, syllabusHasContent } from "@/lib/syllabus";

const course = { tagline: "Visualize data to support decisions.", lessons: [{ title: "L1", section: "Foundations" }, { title: "L2", section: "Foundations" }, { title: "L3", section: "Tableau" }] };

describe("syllabus template", () => {
  it("starts from what the course already says about itself", () => {
    const blank = blankSyllabus(course);
    expect(blank.description).toBe("Visualize data to support decisions.");
    expect(blank.outline).toEqual(["Foundations", "Tableau"]);
    expect(blank.grading.map((row) => row.type)).toEqual(["Knowledge Checks", "Discussions", "Assignments", "Community Forums"]);
    expect(blank.gradingScale[0]).toEqual({ letter: "A", range: "93% +" });
    expect(blankSyllabus({ lessons: [{ title: "Intro" }, { title: "Next" }] }).outline).toEqual(["Intro", "Next"]);
  });

  it("works out each assignment type's share of the grade", () => {
    const grading = [["Knowledge Checks", 225], ["Discussions", 255], ["Assignments", 380], ["Community Forums", 140]].map(([type, points]) => ({ type: String(type), points: Number(points), description: "" }));
    expect(gradingShares(grading)).toEqual({ total: 1000, shares: ["22.5%", "25.5%", "38%", "14%"] });
    expect(gradingShares([{ type: "Quiz", points: 0, description: "" }]).shares).toEqual(["—"]);
  });

  it("keeps what was filled in and drops blank rows", () => {
    const saved = cleanSyllabus({
      ...blankSyllabus(course), courseCode: "  BUS 6151 ", credits: "3",
      outcomes: [{ outcome: "Select appropriate visualizations.", assessments: "Assignments" }, { outcome: "", assessments: "ignored" }],
      requiredTexts: ["Knaflic (2015). Storytelling with data.", "   "],
      grading: [{ type: "Assignments", points: "380", description: "Hands-on work." }, { type: "", points: 50, description: "" }],
      policies: [{ title: "Late assignment policy", text: "Due by 11:59 pm." }, { title: "Citation expectations", text: "" }],
    });
    expect(saved).toMatchObject({
      kind: "template", courseCode: "BUS 6151", credits: "3",
      outcomes: [{ outcome: "Select appropriate visualizations.", assessments: "Assignments" }],
      requiredTexts: ["Knaflic (2015). Storytelling with data."],
      grading: [{ type: "Assignments", points: 380, description: "Hands-on work." }],
      policies: [{ title: "Late assignment policy", text: "Due by 11:59 pm." }],
    });
    expect(syllabusHasContent(saved)).toBe(true);
  });

  it("caps lengths and row counts, and ignores fields it doesn't know", () => {
    const saved = cleanSyllabus({ kind: "template", description: "x".repeat(9000), outline: Array(80).fill("Module"), evil: "<script>", grading: [{ type: "Quiz", points: -5 }] });
    expect(saved?.kind === "template" && saved.description.length).toBe(6000);
    expect(saved?.kind === "template" && saved.outline.length).toBe(40);
    expect(saved).not.toHaveProperty("evil");
    expect(saved?.kind === "template" && saved.grading[0].points).toBe(0);
  });
});

describe("uploaded syllabus", () => {
  const fileUrl = "/api/resources/0123456789abcdef0123456789abcdef";

  it("accepts a PDF or Word file stored by this app", () => {
    expect(cleanSyllabus({ kind: "file", fileUrl, fileName: "bus6151-syllabus.pdf" })).toMatchObject({ kind: "file", fileUrl, fileName: "bus6151-syllabus.pdf" });
    expect(cleanSyllabus({ kind: "file", fileUrl, fileName: "syllabus.DOCX" })).not.toBeNull();
  });

  it("rejects other file types, outside links, and things that aren't a syllabus", () => {
    expect(cleanSyllabus({ kind: "file", fileUrl, fileName: "syllabus.exe" })).toBeNull();
    expect(cleanSyllabus({ kind: "file", fileUrl: "https://evil.example.com/s.pdf", fileName: "s.pdf" })).toBeNull();
    expect(cleanSyllabus({ kind: "other" })).toBeNull();
    expect(cleanSyllabus("syllabus")).toBeNull();
    expect(syllabusHasContent(null)).toBe(false);
    expect(syllabusHasContent(cleanSyllabus({ kind: "template" }))).toBe(false);
  });
});
