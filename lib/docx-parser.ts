/**
 * A from-scratch, dependency-free .docx → paragraph parser for the browser.
 *
 * There's no PDF.js/mammoth-style library in this project and the sandbox
 * this app is built in has no network access to install one, so this hand-
 * rolls the minimum needed to show a docx submission for tutor markup:
 *  1. A ZIP central-directory reader (docx is a ZIP container) using only
 *     Uint8Array/DataView — no zip library.
 *  2. `DecompressionStream('deflate-raw')` (a native browser API) to inflate
 *     the one entry we need, word/document.xml — ZIP's DEFLATE method is
 *     exactly raw deflate.
 *  3. DOMParser (also native) to walk the OOXML paragraph/run structure into
 *     plain {text, bold, italic, underline} runs the UI can render.
 *
 * This is intentionally narrow: paragraphs, basic run formatting, and
 * heading styles. Tables, images, footnotes, etc. are not extracted — a
 * tutor grading a written assignment needs to read the text, not reproduce
 * every layout detail of the original document.
 */

export interface DocxRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

export interface DocxParagraph {
  runs: DocxRun[];
  heading: 1 | 2 | 3 | null;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_DOCUMENT_XML_BYTES = 20 * 1024 * 1024;
const MAX_PARAGRAPHS = 20_000;

class DocxParseError extends Error {}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const maxCommentLength = 65535;
  const searchStart = Math.max(0, bytes.length - 22 - maxCommentLength);
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (
      bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  throw new DocxParseError("Not a valid .docx file (no ZIP end-of-central-directory record).");
}

async function inflateRawDeflate(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new DocxParseError("This browser can't decompress .docx files. Try an up-to-date Chrome, Edge, or Firefox.");
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
        throw new DocxParseError("This document expands beyond the supported size.");
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

/** Extracts and decompresses one named entry (e.g. "word/document.xml") from a .docx/.zip container. */
async function extractZipEntry(fileBytes: ArrayBuffer, entryName: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(fileBytes);
  const view = new DataView(fileBytes);
  if (bytes.length < 22) throw new DocxParseError("Not a valid .docx file.");
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (view.getUint32(eocdOffset, true) !== EOCD_SIGNATURE) throw new DocxParseError("Corrupt ZIP end-of-central-directory record.");

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  if (entryCount > MAX_ZIP_ENTRIES || cdOffset > bytes.length - 46) throw new DocxParseError("Corrupt ZIP central directory.");

  const decoder = new TextDecoder("utf-8");
  let compressionMethod = -1;
  let compressedSize = -1;
  let uncompressedSize = -1;
  let localHeaderOffset = -1;

  for (let i = 0; i < entryCount; i++) {
    if (cdOffset < 0 || cdOffset + 46 > bytes.length) throw new DocxParseError("Corrupt ZIP central directory.");
    if (view.getUint32(cdOffset, true) !== CENTRAL_DIR_SIGNATURE) throw new DocxParseError("Corrupt ZIP central directory.");
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const uncompSize = view.getUint32(cdOffset + 24, true);
    const nameLength = view.getUint16(cdOffset + 28, true);
    const extraLength = view.getUint16(cdOffset + 30, true);
    const commentLength = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);
    const nextOffset = cdOffset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > bytes.length) throw new DocxParseError("Corrupt ZIP central directory.");
    const nameBytes = bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLength);
    const name = decoder.decode(nameBytes);

    if (name === entryName) {
      compressionMethod = method;
      compressedSize = compSize;
      uncompressedSize = uncompSize;
      localHeaderOffset = localOffset;
      break;
    }
    cdOffset = nextOffset;
  }

  if (localHeaderOffset < 0) throw new DocxParseError(`This .docx file is missing ${entryName} — it may be corrupt.`);
  if (uncompressedSize < 0 || uncompressedSize > MAX_DOCUMENT_XML_BYTES) throw new DocxParseError("This document expands beyond the supported size.");
  if (localHeaderOffset + 30 > bytes.length) throw new DocxParseError("Corrupt ZIP local file header.");
  if (view.getUint32(localHeaderOffset, true) !== LOCAL_HEADER_SIGNATURE) throw new DocxParseError("Corrupt ZIP local file header.");

  const localNameLength = view.getUint16(localHeaderOffset + 26, true);
  const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
  if (dataStart > bytes.length || compressedSize < 0 || dataStart + compressedSize > bytes.length) throw new DocxParseError("Corrupt ZIP entry data.");
  const compressed = bytes.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) {
    if (compressed.length > MAX_DOCUMENT_XML_BYTES) throw new DocxParseError("This document expands beyond the supported size.");
    return compressed;
  }
  if (compressionMethod === 8) return inflateRawDeflate(compressed, MAX_DOCUMENT_XML_BYTES);
  throw new DocxParseError("Unsupported compression method in this .docx file.");
}

function boolRunProp(runProps: Element | undefined, tag: string): boolean {
  if (!runProps) return false;
  const el = runProps.getElementsByTagName(tag)[0];
  if (!el) return false;
  const val = el.getAttribute("w:val");
  return val === null || (val !== "0" && val.toLowerCase() !== "false");
}

function headingLevel(paragraph: Element): 1 | 2 | 3 | null {
  const pStyle = paragraph.getElementsByTagName("w:pStyle")[0];
  const val = pStyle?.getAttribute("w:val") ?? "";
  if (/^(heading1|title)$/i.test(val)) return 1;
  if (/^heading2$/i.test(val)) return 2;
  if (/^heading3$/i.test(val)) return 3;
  return null;
}

function parseParagraphs(xml: string): DocxParagraph[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror")[0]) {
    throw new DocxParseError("Couldn't parse this document's contents.");
  }

  const paragraphElements = Array.from(doc.getElementsByTagName("w:p"));
  if (paragraphElements.length > MAX_PARAGRAPHS) throw new DocxParseError("This document has too many paragraphs to display safely.");
  return paragraphElements.map((p) => {
    const runs: DocxRun[] = Array.from(p.getElementsByTagName("w:r")).map((r) => {
      const runProps = r.getElementsByTagName("w:rPr")[0];
      const text = Array.from(r.getElementsByTagName("w:t")).map((t) => t.textContent ?? "").join("");
      const hasTab = r.getElementsByTagName("w:tab").length > 0;
      return {
        text: text + (hasTab ? "\t" : ""),
        bold: boolRunProp(runProps, "w:b"),
        italic: boolRunProp(runProps, "w:i"),
        underline: boolRunProp(runProps, "w:u"),
      };
    });
    return { runs, heading: headingLevel(p) };
  });
}

/** Parses a .docx file's ArrayBuffer into paragraphs ready to render. */
export async function parseDocx(fileBytes: ArrayBuffer): Promise<DocxParagraph[]> {
  const xmlBytes = await extractZipEntry(fileBytes, "word/document.xml");
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  return parseParagraphs(xml);
}

export { DocxParseError };
