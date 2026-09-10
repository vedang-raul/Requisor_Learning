/**
 * A from-scratch, dependency-free ZIP writer — the counterpart to
 * lib/browser-zip.ts's reader. Builds a real ZIP (local file headers +
 * central directory + end-of-central-directory record) using only
 * Uint8Array/DataView for the structure and the native
 * `CompressionStream('deflate-raw')` API for compression — available in
 * both the browser and Node 18+, so this file runs in either. Used by
 * lib/canvas-export.ts to produce a genuine Canvas-compatible .imscc
 * package (a .imscc IS a ZIP — see lib/canvas-import.ts for the read side).
 */

export interface ZipInputEntry {
  name: string;
  data: Uint8Array | string;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(data.slice());
  void writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) { chunks.push(value); total += value.length; }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

// DOS date/time packed format ZIP local/central headers expect — a fixed
// stand-in timestamp is fine here (nothing in this app reads it back on import).
const DOS_TIME = 0;
const DOS_DATE = (1 << 9) | (1 << 5) | 1; // 1980-01-01, the DOS epoch

function writeUint16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function writeUint32(view: DataView, offset: number, value: number) { view.setUint32(offset, value, true); }

/** Builds a real ZIP file from a list of {name, data} entries, compressed with DEFLATE. */
export async function createZip(entries: ZipInputEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const rawBytes = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    const compressed = await deflateRaw(rawBytes);
    const checksum = crc32(rawBytes);
    const localHeaderOffset = offset;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, LOCAL_HEADER_SIGNATURE);
    writeUint16(localView, 4, 20); // version needed
    writeUint16(localView, 6, 0); // flags
    writeUint16(localView, 8, 8); // compression method: deflate
    writeUint16(localView, 10, DOS_TIME);
    writeUint16(localView, 12, DOS_DATE);
    writeUint32(localView, 14, checksum);
    writeUint32(localView, 18, compressed.length);
    writeUint32(localView, 22, rawBytes.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0); // extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, compressed);
    offset += localHeader.length + compressed.length;

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, CENTRAL_DIR_SIGNATURE);
    writeUint16(centralView, 4, 20); // version made by
    writeUint16(centralView, 6, 20); // version needed
    writeUint16(centralView, 8, 0); // flags
    writeUint16(centralView, 10, 8); // compression method
    writeUint16(centralView, 12, DOS_TIME);
    writeUint16(centralView, 14, DOS_DATE);
    writeUint32(centralView, 16, checksum);
    writeUint32(centralView, 20, compressed.length);
    writeUint32(centralView, 24, rawBytes.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0); // extra length
    writeUint16(centralView, 32, 0); // comment length
    writeUint16(centralView, 34, 0); // disk number start
    writeUint16(centralView, 36, 0); // internal attrs
    writeUint32(centralView, 38, 0); // external attrs
    writeUint32(centralView, 42, localHeaderOffset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const part of centralParts) centralDirSize += part.length;

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeUint32(eocdView, 0, EOCD_SIGNATURE);
  writeUint16(eocdView, 4, 0); // disk number
  writeUint16(eocdView, 6, 0); // disk where CD starts
  writeUint16(eocdView, 8, entries.length);
  writeUint16(eocdView, 10, entries.length);
  writeUint32(eocdView, 12, centralDirSize);
  writeUint32(eocdView, 16, centralDirOffset);
  writeUint16(eocdView, 20, 0); // comment length

  const totalSize = offset + centralDirSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    output.set(part, pos);
    pos += part.length;
  }
  return output;
}
