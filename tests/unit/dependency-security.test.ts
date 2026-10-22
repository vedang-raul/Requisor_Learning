/**
 * These intentionally exercise transitive dependencies: an audit alone cannot
 * establish compatibility of major-version overrides.
 */
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fromPackage = (name: string) => createRequire(require.resolve(name));

describe("dependency security replacements", () => {
  const fromTailwind = fromPackage("tailwindcss");
  const fromMicromatch = fromPackage(fromTailwind.resolve("micromatch"));
  const fromChokidar = fromPackage(fromTailwind.resolve("chokidar"));
  const braces = fromMicromatch("braces");

  // The team chose the official package over an unofficial depth-guard fork
  // (see docs/dependency-security.md), so both consumers must resolve it.
  it("uses the official braces package in both glob consumers", () => {
    for (const consumer of [fromMicromatch, fromChokidar]) {
      expect(consumer("braces/package.json")).toMatchObject({ name: "braces" });
    }
  });

  it("preserves normal source-file glob expansion and matching", () => {
    expect(braces.expand("./src/**/*.{ts,tsx,js,jsx}")).toEqual([
      "./src/**/*.ts", "./src/**/*.tsx", "./src/**/*.js", "./src/**/*.jsx",
    ]);
    const micromatch = fromTailwind("micromatch");
    expect(micromatch(["src/a.ts", "src/b.tsx", "src/c.css"], "src/*.{ts,tsx}"))
      .toEqual(["src/a.ts", "src/b.tsx"]);
    expect(braces.expand("file-{1..3}")).toEqual(["file-1", "file-2", "file-3"]);
  });

  it("supports the selector APIs used by Tailwind and postcss-nested", () => {
    const parser = fromTailwind("postcss-selector-parser");
    expect(parser().processSync(".card:is(.active, #selected) > a:hover"))
      .toBe(".card:is(.active, #selected) > a:hover");
    const flat = ".a".repeat(20000);
    expect(parser().processSync(flat)).toBe(flat);
  });

  it("loads YAML coverage configuration without the old sprintf-js dependency", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dependency-nyc-"));
    try {
      const configFile = join(directory, ".nycrc.yaml");
      writeFileSync(configFile, "all: true\ninclude:\n  - src/**/*.ts\n");
      const { loadNycConfig } = require("@istanbuljs/load-nyc-config");
      expect(await loadNycConfig({ cwd: directory, nycrcPath: configFile }))
        .toMatchObject({ all: true, include: ["src/**/*.ts"] });
      const yaml = fromPackage("@istanbuljs/load-nyc-config")("js-yaml");
      expect(() => yaml.load("a: &a [{}, {}, {}]\nb:\n  <<: *a\n", {
        maxTotalMergeKeys: 1,
      })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("retains UUID v4 compatibility and rejects out-of-bounds UUID writes", () => {
    const uuid = fromPackage("vosk-browser")("uuid");
    expect(uuid.validate(uuid.v4())).toBe(true);
    expect(() => uuid.v5("name", uuid.v5.DNS, new Uint8Array(8), 4))
      .toThrow(RangeError);
  });

  it("loads sharp and processes an image using the patched native libraries", async () => {
    const sharp = fromPackage("next")("sharp");
    const { info } = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#23ae97" },
    }).png().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 2, height: 2, format: "png" });
  });
});
