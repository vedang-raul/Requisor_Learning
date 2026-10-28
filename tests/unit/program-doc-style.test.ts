import JSZip from "jszip";
import { DEFAULT_PROGRAM_DOC_STYLE, logoSource, readDocStyle } from "@/lib/courses/program-doc-style";
import { buildDocx, documentXml } from "@/lib/courses/program-docx";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("Program Builder document style", () => {
  it("cleans a saved style and picks the logo to show", () => {
    expect(readDocStyle(null)).toEqual(DEFAULT_PROGRAM_DOC_STYLE);
    expect(readDocStyle({ accent: "#1e3a8a", logo: "none" })).toEqual({ accent: "#1E3A8A", logo: "none" });
    expect(readDocStyle({ accent: "red", logo: "custom" })).toEqual(DEFAULT_PROGRAM_DOC_STYLE); // no custom logo saved
    expect(readDocStyle({ logo: "custom", customLogo: "javascript:alert(1)" }).logo).toBe("default");
    const custom = readDocStyle({ accent: "#9F1239", logo: "custom", customLogo: PNG });
    expect(logoSource(custom, "/msoe-logo.png")).toBe(PNG);
    expect(logoSource({ ...custom, logo: "default" }, "/msoe-logo.png")).toBe("/msoe-logo.png");
    expect(logoSource({ ...custom, logo: "none" }, "/msoe-logo.png")).toBeNull();
  });

  it("colours the Word file and embeds the logo", async () => {
    const blocks = [{ kind: "heading" as const, runs: [{ text: "Hello" }] }];
    const zip = await JSZip.loadAsync(await buildDocx(blocks, { accent: "#9F1239", logo: { png: new Uint8Array([137, 80, 78, 71]), width: 400, height: 100 } }).generateAsync({ type: "uint8array" }));
    expect(await zip.file("word/styles.xml")!.async("string")).toContain('w:color w:val="9F1239"');
    expect(zip.file("word/media/logo.png")).toBeTruthy();
    expect(await zip.file("word/_rels/document.xml.rels")!.async("string")).toContain('Target="media/logo.png"');
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain('r:embed="rIdLogo"');
    expect(xml).toMatch(/<wp:extent cx="2194560" cy="548640"\/>/); // 0.6 in tall, 4:1
    const plain = documentXml(blocks);
    expect(plain).not.toContain("rIdLogo");
  });
});
