import JSZip from "jszip";
import { buildDocx, blueprintBlocks, documentXml, proposalBlocks } from "@/lib/courses/program-docx";
import { buildProposal, composeCurriculum, EMPTY_DISCOVERY, sampleDiscovery } from "@/lib/courses/program-builder";

const curriculum = composeCurriculum(sampleDiscovery(EMPTY_DISCOVERY));

describe("Program Builder Word documents", () => {
  it("packages a .docx with the parts Word needs", async () => {
    const zip = await JSZip.loadAsync(await buildDocx(blueprintBlocks(curriculum, "Acme", "October 26, 2026")).generateAsync({ type: "uint8array" }));
    expect(Object.keys(zip.files).sort()).toEqual(["[Content_Types].xml", "_rels/", "_rels/.rels", "word/", "word/_rels/", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml"]);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("CURRICULUM BLUEPRINT");
    expect(xml).toContain(curriculum.title);
    for (const module of curriculum.modules) expect(xml).toContain(module.submodules[0].replace(/&/g, "&amp;"));
    expect(xml).toContain("Prepared for ");
  });

  it("has the proposal's sections and pricing table with the total in bold", () => {
    const proposal = buildProposal(curriculum, "Acme", new Date("2026-10-26T12:00:00Z"));
    const xml = documentXml(proposalBlocks(proposal));
    for (const heading of ["Need identified", "Program description", "Learning outcomes", "Curriculum", "Delivery &amp; measurement", "Investment"]) expect(xml).toContain(heading);
    expect(xml).toMatch(/<w:b\/><\/w:rPr><w:t xml:space="preserve">Total — first cohort/);
    expect((xml.match(/<w:tr>/g) ?? []).length).toBe(proposal.pricing.length + 2);
  });

  it("escapes text and drops characters XML can't hold", () => {
    const xml = documentXml([{ kind: "paragraph", runs: [{ text: "R&D <tools> \"x\" \u0001ok" }] }]);
    expect(xml).toContain("R&amp;D &lt;tools&gt; &quot;x&quot; ok");
  });
});

describe("the theme colour on every page of a long Word file", () => {
  const blocks = [{ kind: "subheading" as const, runs: [{ text: "Module 1" }] }];
  it("puts a band in the theme colour at the top of every page", () => {
    expect(documentXml(blocks, { accent: "#9F1239" })).toContain('<w:pgBorders w:offsetFrom="page"><w:top w:val="single" w:sz="24" w:space="24" w:color="9F1239"/></w:pgBorders>');
  });
  it("colours module titles with the theme", async () => {
    const styles = await buildDocx(blocks, { accent: "#9F1239" }).file("word/styles.xml")!.async("string");
    expect(styles).toMatch(/w:styleId="Heading2"[\s\S]*?<w:color w:val="9F1239"\/>/);
  });

  it("follows the tutor's changes: sections out, headings reworded, own sections, nothing blank", () => {
    const curriculum = composeCurriculum({ ...EMPTY_DISCOVERY, topic: "Estimating" });
    const base = buildProposal(curriculum, "", new Date(2026, 9, 8));
    const text = JSON.stringify(proposalBlocks({
      ...base, employer: "", need: "", outcomes: [], pricingNote: "",
      custom: { hidden: ["description", "total", "footer"], labels: { investment: "Fees", amount: "Cost" }, extras: [{ title: "Our team", body: "Who teaches it" }, { title: "", body: "" }] },
    }));
    for (const gone of ["Need identified", "Program description", "Learning outcomes", "Total — first cohort", "Generated with", "Prepared for", "Investment"]) expect(text).not.toContain(gone);
    for (const kept of ["Fees", "Cost", "Our team", "Who teaches it"]) expect(text).toContain(kept);
    expect(proposalBlocks({ ...base, custom: {} }).filter((b) => b.kind !== "table" && !b.runs.some((r) => r.text.trim()))).toEqual([]);

    const blueprint = blueprintBlocks({ ...curriculum, modules: [{ title: "Only", description: "", submodules: [], activities: [] }], custom: { hidden: ["level", "assessment"], labels: { audience: "Who" } } }, "", "today");
    const table = blueprint.find((b) => b.kind === "table");
    expect(table).toMatchObject({ header: ["Who", "Format", "Duration"] });
    expect(JSON.stringify(blueprint)).not.toContain("Submodules");
    expect(JSON.stringify(blueprint)).not.toContain("Assessment");
  });
});
