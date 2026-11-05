import { isValidAssignmentBrand, lessonForLearner, ndaTemplate, readAssignmentBrand } from "@/lib/courses/assignment-brand";
import { brandProblem, cleanBrand } from "@/components/tutor/assignment-brand-editor";
import { validateCourse } from "@/lib/courses/course-catalog";

const file = (n: string) => `/api/resources/${n.repeat(32).slice(0, 32)}`;
const brand = {
  name: "Findorff Construction", logoUrl: file("a"), bannerUrl: file("b"), accent: "#7A0019",
  links: [{ label: "Website", url: "https://www.findorff.com" }],
  nda: { text: ndaTemplate("Findorff Construction") },
};

describe("branded assignments", () => {
  it("accepts a whole brand, and refuses anything risky or out of shape", () => {
    expect(isValidAssignmentBrand(brand)).toBe(true);
    expect(isValidAssignmentBrand({ name: "Acme", links: [] })).toBe(true);
    expect(isValidAssignmentBrand({ ...brand, name: "A" })).toBe(false);
    expect(isValidAssignmentBrand({ ...brand, logoUrl: "https://evil.example/logo.png" })).toBe(false);
    expect(isValidAssignmentBrand({ ...brand, links: [{ label: "Site", url: "javascript:alert(1)" }] })).toBe(false);
    expect(isValidAssignmentBrand({ ...brand, links: [{ label: "Site", url: "http://plain.example" }] })).toBe(false);
    expect(isValidAssignmentBrand({ ...brand, accent: "red" })).toBe(false);
    expect(isValidAssignmentBrand({ ...brand, nda: { text: "Too short" } })).toBe(false);
    expect(isValidAssignmentBrand({ ...brand, extra: 1 })).toBe(false);
    expect(isValidAssignmentBrand({ ...brand, links: Array(5).fill({ label: "x", url: "https://x.example" }) })).toBe(false);
  });

  it("reads a stored brand back cleanly, dropping anything bad", () => {
    expect(readAssignmentBrand(brand)).toEqual({ ...brand, accent: "#7A0019" });
    expect(readAssignmentBrand({ name: "Acme", logoUrl: "https://x.example/a.png", links: [{ label: "", url: "https://x" }, { label: "Bad", url: "ftp://x" }] }))
      .toEqual({ name: "Acme", links: [] });
    expect(readAssignmentBrand({ name: "" })).toBeNull();
    expect(readAssignmentBrand(null)).toBeNull();
  });

  it("holds an NDA lesson's brief back from learners, and only that", () => {
    expect(lessonForLearner({ assignment: "Secret brief", assignmentBrand: brand })).toEqual({ assignmentBrand: brand });
    const open = { assignment: "Public brief", assignmentBrand: { name: "Acme", links: [] } };
    expect(lessonForLearner(open)).toBe(open);
    expect(lessonForLearner({ assignment: "Plain" })).toEqual({ assignment: "Plain" });
  });

  it("cleans the editor's brand and says what's missing", () => {
    expect(cleanBrand({ name: "  Acme ", links: [{ label: "", url: "" }, { label: " Site ", url: " https://acme.example " }] }))
      .toEqual({ name: "Acme", links: [{ label: "Site", url: "https://acme.example" }] });
    expect(brandProblem({ name: "", links: [] })).toMatch(/Name the brand/);
    expect(brandProblem({ name: "Acme", links: [{ label: "Site", url: "acme.example" }] })).toMatch(/https/);
    expect(brandProblem({ name: "Acme", links: [], nda: { text: "short" } })).toMatch(/agreement/);
    expect(brandProblem({ name: "Acme", links: [], nda: { text: ndaTemplate("Acme") } })).toBeNull();
  });

  it("is saved through the course check like any other lesson field", () => {
    const lesson = { id: "acme-1", title: "Site safety", description: "Learn it.", youtubeId: "", durationMin: 10, resources: [], keyTakeaways: [], format: "reading", body: "Text", assignment: "Brief", requiresSubmission: true };
    const course = { slug: "acme", title: "Acme", tagline: "A demo", category: "ai", level: "Beginner", tags: [], cover: "from-a to-b", addedAt: "2026-11-04", lessons: [{ ...lesson, assignmentBrand: brand }] };
    expect(validateCourse(course).ok).toBe(true);
    expect(validateCourse({ ...course, lessons: [{ ...lesson, assignmentBrand: { ...brand, links: [{ label: "x", url: "javascript:x" }] } }] }).ok).toBe(false);
  });

  it("fills the brand into the NDA template", () => {
    expect(ndaTemplate("Acme")).toContain("in partnership with Acme");
    expect(ndaTemplate(" ")).toContain("the sponsoring organisation");
  });
});
