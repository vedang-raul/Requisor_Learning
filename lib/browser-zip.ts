/**
 * A from-scratch, dependency-free ZIP reader for the browser — no zip
 * library, just Uint8Array/DataView for the central directory and the
 * native `DecompressionStream('deflate-raw')` API for inflation (ZIP's
 * DEFLATE compression method is exactly raw deflate). Shared by
 * lib/docx-parser.ts (.docx is a ZIP) and lib/canvas-import.ts (a Canvas
 * .imscc course export is also a ZIP).
 *
 * Deliberately entry-at-a-time: `listZipEntries` reads only the central
 * directory (names + offsets, not content), so a caller can decompress just
 * the few small XML/HTML entries it actually needs out of a cartridge that
 * may also contain tens of megabytes of unrelated attached media.
 */

export class ZipParseError extends Error {}

export interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_ZIP_ENTRIES = 2_000;
const DEFAULT_MAX_ENTRY_BYTES = 10 * 1024 * 1024;

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const maxCommentLength = 65535;
  const searchStart = Math.max(0, bytes.length - 22 - maxCommentLength);
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      return i;
    }
  }
  throw new ZipParseError("Not a valid ZIP file (no end-of-central-directory record).");
}

/** Reads every entry's name and location from the central directory — cheap, no decompression. */
export function listZipEntries(fileBytes: ArrayBuffer): ZipEntry[] {
  const bytes = new Uint8Array(fileBytes);
  const view = new DataView(fileBytes);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (view.getUint32(eocdOffset, true) !== EOCD_SIGNATURE) throw new ZipParseError("Corrupt ZIP end-of-central-directory record.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  if (entryCount > MAX_ZIP_ENTRIES) throw new ZipParseError("This archive contains too many files.");
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i++) {
    if (cdOffset < 0 || cdOffset + 46 > bytes.length) throw new ZipParseError("Corrupt ZIP central directory.");
    if (view.getUint32(cdOffset, true) !== CENTRAL_DIR_SIGNATURE) throw new ZipParseError("Corrupt ZIP central directory.");
    const compressionMethod = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const uncompressedSize = view.getUint32(cdOffset + 24, true);
    const nameLength = view.getUint16(cdOffset + 28, true);
    const extraLength = view.getUint16(cdOffset + 30, true);
    const commentLength = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    // The ZIP spec calls for "/", but some Windows-made archives (e.g. a zip
    // re-packaged with Explorer/PowerShell rather than produced by the
    // original tool) write "\" — normalize so name lookups by a "/" path
    // still find the entry either way.
    const nextOffset = cdOffset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > bytes.length) throw new ZipParseError("Corrupt ZIP central directory.");
    const name = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLength)).replace(/\\/g, "/");

    entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
    cdOffset = nextOffset;
  }
  return entries;
}

async function inflateRawDeflate(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new ZipParseError("This browser can't decompress this file. Try an up-to-date Chrome, Edge, or Firefox.");
  }
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  void writer.write(data.slice());
  void writer.close();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new ZipParseError("An archived file expands beyond the supported size.");
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

/** Decompresses one entry (from listZipEntries) into its raw bytes. */
export async function readZipEntry(fileBytes: ArrayBuffer, entry: ZipEntry, maxBytes = DEFAULT_MAX_ENTRY_BYTES): Promise<Uint8Array> {
  const bytes = new Uint8Array(fileBytes);
  const view = new DataView(fileBytes);
  if (entry.uncompressedSize > maxBytes) throw new ZipParseError("An archived file expands beyond the supported size.");
  if (entry.localHeaderOffset < 0 || entry.localHeaderOffset + 30 > bytes.length) throw new ZipParseError("Corrupt ZIP local file header.");
  if (view.getUint32(entry.localHeaderOffset, true) !== LOCAL_HEADER_SIGNATURE) throw new ZipParseError("Corrupt ZIP local file header.");

  const nameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const extraLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
  if (dataStart > bytes.length || dataStart + entry.compressedSize > bytes.length) throw new ZipParseError("Corrupt ZIP entry data.");
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    if (compressed.length > maxBytes) throw new ZipParseError("An archived file expands beyond the supported size.");
    return compressed;
  }
  if (entry.compressionMethod === 8) return inflateRawDeflate(compressed, maxBytes);
  throw new ZipParseError(`Unsupported ZIP compression method (${entry.compressionMethod}) for ${entry.name}.`);
}

/** Convenience: look up and decompress one entry by exact name, or null if absent. */
export async function readZipEntryByName(fileBytes: ArrayBuffer, name: string, entries?: ZipEntry[]): Promise<Uint8Array | null> {
  const entry = (entries ?? listZipEntries(fileBytes)).find((e) => e.name === name);
  if (!entry) return null;
  return readZipEntry(fileBytes, entry);
}

/** Convenience: readZipEntryByName + UTF-8 decode, for text entries. */
export async function readZipTextEntry(fileBytes: ArrayBuffer, name: string, entries?: ZipEntry[]): Promise<string | null> {
  const bytes = await readZipEntryByName(fileBytes, name, entries);
  return bytes ? new TextDecoder("utf-8").decode(bytes) : null;
}
