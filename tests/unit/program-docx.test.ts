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
