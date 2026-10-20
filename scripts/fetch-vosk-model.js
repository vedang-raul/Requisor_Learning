#!/usr/bin/env node
/**
 * Downloads the Vosk speech model used for the "Hey Requisor" wake word and
 * stores it as public/vosk/<model>.tar.gz, the format vosk-browser loads.
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
const OUT_FILE = path.join(OUT_DIR, `${MODEL}.tar.gz`);
const MIN_BYTES = 30 * 1024 * 1024; // a complete model is ~40 MB

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
  fs.writeFileSync(path.join(OUT_DIR, "vosk-worker.js"), source.subarray(start));
  console.log("[vosk] Wrote public/vosk/vosk-worker.js.");
}

async function main() {
  writeWorker();
  if (fs.existsSync(OUT_FILE) && fs.statSync(OUT_FILE).size >= MIN_BYTES) {
    console.log(`[vosk] ${path.relative(process.cwd(), OUT_FILE)} already present.`);
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

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmp = `${OUT_FILE}.part`;
  fs.writeFileSync(tmp, zlib.gzipSync(Buffer.concat(parts), { level: 6 }));
  fs.renameSync(tmp, OUT_FILE);
  console.log(`[vosk] Saved ${path.relative(process.cwd(), OUT_FILE)} (${(fs.statSync(OUT_FILE).size / 1048576).toFixed(1)} MB).`);
}

main().catch((error) => {
  console.warn(`[vosk] Skipped the wake-word model: ${error.message}. "Hey Requisor" will be unavailable until \`npm run vosk:model\` succeeds.`);
});
