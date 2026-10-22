#!/usr/bin/env node
/**
 * Downloads the Vosk speech model used for the "Hey Requisor" wake word (and
 * the voice "stop") in the .tar.gz format vosk-browser loads, and publishes it
 * in parts under public/vosk/: <model>.tar.gz.part0, .part1, … plus
 * <model>.tar.gz.parts.json listing them. Some hosts refuse single responses
 * over 32 MB (Replit autoscale runs on Cloud Run), and the model is ~40 MB;
 * the worker joins the parts back into one download (see PARTS_SHIM below).
 *
 * The model (~40 MB, Apache-2.0) comes from the official Vosk site as a .zip;
 * it is repacked here into a .tar.gz with the model in one top-level folder
 * (vosk-browser strips that folder when it unpacks). Kept out of git: this
 * runs before every build (see "prebuild") and can be run by hand with
 * `npm run vosk:model`. It does nothing if the file is already there.
 *
 * A failed download never breaks the build: the wake word just stays
 * unavailable (the app checks for the file before offering it).
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const MODEL = "vosk-model-small-en-us-0.15";
const SOURCE = `https://alphacephei.com/vosk/models/${MODEL}.zip`;
const OUT_DIR = path.join(__dirname, "..", "public", "vosk");
/** The whole archive, kept out of public/ so it is never served or deployed as one file. */
const CACHE_FILE = path.join(__dirname, "..", "node_modules", ".cache", "vosk", `${MODEL}.tar.gz`);
const PUBLIC_NAME = `${MODEL}.tar.gz`;
const MANIFEST = path.join(OUT_DIR, `${PUBLIC_NAME}.parts.json`);
const PART_BYTES = 16 * 1024 * 1024; // well under the 32 MB response limit
const MIN_BYTES = 30 * 1024 * 1024; // a complete model is ~40 MB

/**
 * Put first in the worker: when vosk-browser downloads the model, fetch its
 * parts and hand them back as one streamed response with the original size,
 * so the library (and its cache, keyed by the model URL) sees one file.
 */
const PARTS_SHIM = `/* Requisor: the model is published in parts (scripts/fetch-vosk-model.js). */
(() => {
  const realFetch = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url, self.location.href);
    const file = url.pathname.startsWith("/vosk/") ? url.pathname.slice(6) : "";
    if (!file.endsWith(".tar.gz") || file.includes("/")) return realFetch(input, init);
    const listing = await realFetch(url.href + ".parts.json", { cache: "no-cache" });
    if (!listing.ok) return realFetch(input, init);
    const { parts, size } = await listing.json();
    let index = 0;
    let reader = null;
    const body = new ReadableStream({
      async pull(controller) {
        for (;;) {
          if (!reader) {
            if (index >= parts.length) { controller.close(); return; }
            const part = await realFetch(new URL(parts[index++], url).href);
            if (!part.ok || !part.body) { controller.error(new Error("HTTP error! status: " + part.status)); return; }
            reader = part.body.getReader();
          }
          const { done, value } = await reader.read();
          if (!done) { controller.enqueue(value); return; }
          reader = null;
        }
      },
    });
    return new Response(body, { status: 200, headers: { "Content-Type": "application/gzip", "Content-Length": String(size) } });
  };
})();
`;

/** Splits the cached archive into public parts plus their listing. */
function publishParts() {
  const data = fs.readFileSync(CACHE_FILE);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name === PUBLIC_NAME || name.startsWith(`${PUBLIC_NAME}.part`)) fs.rmSync(path.join(OUT_DIR, name));
  }
  const parts = [];
  for (let offset = 0, index = 0; offset < data.length; offset += PART_BYTES, index++) {
    const name = `${PUBLIC_NAME}.part${index}`;
    fs.writeFileSync(path.join(OUT_DIR, name), data.subarray(offset, offset + PART_BYTES));
    parts.push(name);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify({ size: data.length, parts }));
  console.log(`[vosk] Published the model in ${parts.length} parts.`);
}

/** One 512-byte ustar header. */
function tarHeader(name, size, type) {
  const header = Buffer.alloc(512, 0);
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", 154);
    prefix = name.slice(0, cut);
    name = name.slice(cut + 1);
  }
  const put = (value, offset, length) => header.write(value, offset, length, "utf8");
  put(name, 0, 100);
  put(type === "5" ? "0000755\0" : "0000644\0", 100, 8);
  put("0000000\0", 108, 8);
  put("0000000\0", 116, 8);
  put(size.toString(8).padStart(11, "0") + "\0", 124, 12);
  put(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12);
  put("        ", 148, 8); // checksum placeholder: spaces while summing
  put(type, 156, 1);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  put(prefix, 345, 155);
  let sum = 0;
  for (const byte of header) sum += byte;
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return header;
}

/**
 * vosk-browser ships its worker as a base64 string it turns into a blob: URL,
 * which would inherit the page's strict security policy — and the worker needs
 * eval-style code generation (Emscripten). So it's written out as a real file,
 * /vosk/vosk-worker.js, which src/middleware.ts serves with its own policy, and
 * src/lib/voice/wake-word.ts starts that file instead. Regenerated every run so
 * it always matches the installed vosk-browser.
 */
function writeWorker() {
  let bundle;
  try { bundle = fs.readFileSync(require.resolve("vosk-browser"), "utf8"); } catch {
    console.warn("[vosk] vosk-browser isn't installed; skipping the worker.");
    return;
  }
  const match = bundle.match(/createBase64WorkerFactory\('([A-Za-z0-9+/=]+)'/);
  if (!match) throw new Error("couldn't find the worker in vosk-browser (has the package changed?)");
  const source = Buffer.from(match[1], "base64");
  // Same as vosk-browser's own createURL(): the first line is a loader comment.
  const start = source.indexOf(0x0a, 10) + 1;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "vosk-worker.js"), Buffer.concat([Buffer.from(PARTS_SHIM), source.subarray(start)]));
  console.log("[vosk] Wrote public/vosk/vosk-worker.js.");
}

async function main() {
  writeWorker();
  // An earlier layout put the whole archive in public/: reuse it as the cache.
  const legacy = path.join(OUT_DIR, PUBLIC_NAME);
  if (!fs.existsSync(CACHE_FILE) && fs.existsSync(legacy) && fs.statSync(legacy).size >= MIN_BYTES) {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.renameSync(legacy, CACHE_FILE);
  }
  if (fs.existsSync(CACHE_FILE) && fs.statSync(CACHE_FILE).size >= MIN_BYTES) {
    console.log("[vosk] Model already downloaded.");
    publishParts();
    return;
  }
  let JSZip;
  try { JSZip = require("jszip"); } catch {
    console.warn("[vosk] jszip isn't installed; skipping the wake-word model.");
    return;
  }

  console.log(`[vosk] Downloading ${SOURCE} …`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const zipBytes = Buffer.from(await res.arrayBuffer());
  if (zipBytes.length < MIN_BYTES) throw new Error(`download looks incomplete (${zipBytes.length} bytes)`);

  const zip = await JSZip.loadAsync(zipBytes);
  const entries = Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.some((e) => e.name.startsWith(`${MODEL}/am/`))) throw new Error("unexpected archive layout");

  const parts = [];
  for (const entry of entries) {
    // Only files inside the model folder; never absolute or parent paths.
    if (!entry.name.startsWith(`${MODEL}/`) || entry.name.includes("..")) continue;
    if (entry.dir) { parts.push(tarHeader(entry.name, 0, "5")); continue; }
    const data = await entry.async("nodebuffer");
    parts.push(tarHeader(entry.name, data.length, "0"), data, Buffer.alloc((512 - (data.length % 512)) % 512, 0));
  }
  parts.push(Buffer.alloc(1024, 0)); // end of archive

  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  const tmp = `${CACHE_FILE}.tmp`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.concat(parts), { level: 6 }));
  fs.renameSync(tmp, CACHE_FILE);
  console.log(`[vosk] Downloaded the model (${(fs.statSync(CACHE_FILE).size / 1048576).toFixed(1)} MB).`);
  publishParts();
}

main().catch((error) => {
  console.warn(`[vosk] Skipped the wake-word model: ${error.message}. "Hey Requisor" will be unavailable until \`npm run vosk:model\` succeeds.`);
});
