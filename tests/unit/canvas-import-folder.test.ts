import { existsSync, readFileSync } from "fs";
import { listZipEntries, readZipTextEntry, type ZipEntry } from "@/lib/files/browser-zip";
import { unwrapSingleFolder } from "@/lib/courses/canvas-import";

const entry = (name: string): ZipEntry => ({ name, compressionMethod: 0, compressedSize: 0, localHeaderOffset: 0 });

describe("Canvas exports zipped again inside a folder", () => {
  it("reads from inside the one folder that holds the manifest", () => {
    const out = unwrapSingleFolder([entry("export/"), entry("export/imsmanifest.xml"), entry("export/wiki_content/a.html"), entry("__MACOSX/x")]);
    expect(out.map((e) => e.name)).toEqual(["imsmanifest.xml", "wiki_content/a.html"]);
  });

  it("leaves a normal export, and anything ambiguous, alone", () => {
    const normal = [entry("imsmanifest.xml"), entry("wiki_content/a.html")];
    expect(unwrapSingleFolder(normal)).toBe(normal);
    const two = [entry("a/imsmanifest.xml"), entry("b/imsmanifest.xml")];
    expect(unwrapSingleFolder(two)).toBe(two);
    const deep = [entry("a/b/imsmanifest.xml")];
    expect(unwrapSingleFolder(deep)).toBe(deep);
  });

  const sample = process.env.IMSCC_SAMPLE;
  (sample && existsSync(sample) ? it : it.skip)("finds the manifest in a real re-zipped export", async () => {
    const buf = readFileSync(sample as string);
    const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const entries = unwrapSingleFolder(listZipEntries(bytes));
    const manifest = await readZipTextEntry(bytes, "imsmanifest.xml", entries);
    expect(manifest).toContain("<manifest");
    expect(await readZipTextEntry(bytes, "course_settings/module_meta.xml", entries)).toContain("<modules");
  });
});
