import JSZip from "jszip";
import { DEFAULT_PROGRAM_DOC_STYLE, logoSources, MAX_DOC_LOGOS, readDocStyle } from "@/lib/courses/program-doc-style";
import { buildDocx, documentXml } from "@/lib/courses/program-docx";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const logo = { png: new Uint8Array([137, 80, 78, 71]), width: 400, height: 100 };

describe("Program Builder document style", () => {
  it("cleans a saved style and lists the logos, platform logo first", () => {
    expect(readDocStyle(null)).toEqual(DEFAULT_PROGRAM_DOC_STYLE);
    const style = readDocStyle({ accent: "#9f1239", platformLogo: true, customLogos: [PNG, "javascript:alert(1)", 7, PNG] });
    expect(style).toEqual({ accent: "#9F1239", platformLogo: true, customLogos: [PNG, PNG] });
    expect(logoSources(style, "/msoe-logo.png")).toEqual(["/msoe-logo.png", PNG, PNG]);
    expect(logoSources({ ...style, platformLogo: false }, "/msoe-logo.png")).toEqual([PNG, PNG]);
    expect(logoSources(style, null)).toEqual([PNG, PNG]);
    expect(logoSources(DEFAULT_PROGRAM_DOC_STYLE, "/msoe-logo.png")).toEqual(["/msoe-logo.png"]);
  });

  it("never holds more logos than fit side by side", () => {
    const many = Array.from({ length: 9 }, () => PNG);
    expect(logoSources(readDocStyle({ platformLogo: true, customLogos: many }), "/p.png")).toHaveLength(MAX_DOC_LOGOS);
    expect(logoSources(readDocStyle({ platformLogo: false, customLogos: many }), "/p.png")).toHaveLength(MAX_DOC_LOGOS);
  });

  it("carries over a style saved before several logos", () => {
    expect(readDocStyle({ accent: "#1e3a8a", logo: "none" })).toEqual({ accent: "#1E3A8A", platformLogo: false, customLogos: [] });
    expect(readDocStyle({ logo: "default" }).platformLogo).toBe(true);
    expect(readDocStyle({ logo: "custom", customLogo: PNG })).toMatchObject({ platformLogo: false, customLogos: [PNG] });
    expect(readDocStyle({ accent: "red", logo: "custom" })).toEqual(DEFAULT_PROGRAM_DOC_STYLE); // no custom logo saved
    expect(readDocStyle({ logo: "custom", customLogo: "javascript:alert(1)" }).customLogos).toEqual([]);
  });

  it("colours the Word file and embeds its logos side by side", async () => {
    const blocks = [{ kind: "heading" as const, runs: [{ text: "Hello" }] }];
    const zip = await JSZip.loadAsync(await buildDocx(blocks, { accent: "#9F1239", logos: [logo, logo] }).generateAsync({ type: "uint8array" }));
    expect(await zip.file("word/styles.xml")!.async("string")).toContain('w:color w:val="9F1239"');
    expect(zip.file("word/media/logo1.png")).toBeTruthy();
    expect(zip.file("word/media/logo2.png")).toBeTruthy();
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain('Id="rIdLogo1"');
    expect(rels).toContain('Target="media/logo2.png"');
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain('r:embed="rIdLogo1"');
    expect(xml).toContain('r:embed="rIdLogo2"');
    expect(xml).toContain('<wp:docPr id="2" name="Logo 2"/>');   // Word needs each picture's id to differ
    expect(xml.match(/<w:p>/g)!.length).toBe(xml.match(/<w:t[ >]/g)!.length); // no extra paragraph: same line
    expect(xml).toMatch(/<wp:extent cx="2194560" cy="548640"\/>/); // 0.6 in tall, 4:1
    expect(documentXml(blocks)).not.toContain("rIdLogo");
  });

  it("narrows logos so four still fit across the page", () => {
    const xml = documentXml([], { accent: "#9F1239", logos: [logo, logo, logo, logo] });
    const widths = [...xml.matchAll(/<wp:extent cx="(\d+)"/g)].map((m) => Number(m[1]));
    expect(widths).toHaveLength(4);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(6.5 * 914400);
  });
});
