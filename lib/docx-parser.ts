/**
 * A from-scratch, dependency-free .docx → paragraph parser for the browser.
 *
 * There's no PDF.js/mammoth-style library in this project and the sandbox
 * this app is built in has no network access to install one, so this hand-
 * rolls the minimum needed to show a docx submission for tutor markup:
 *  1. lib/browser-zip.ts (docx is a ZIP container) to get at word/document.xml.
 *  2. DOMParser (native) to walk the OOXML paragraph/run structure into
 *     plain {text, bold, italic, underline} runs the UI can render.
 *
 * This is intentionally narrow: paragraphs, basic run formatting, and
 * heading styles. Tables, images, footnotes, etc. are not extracted — a
 * tutor grading a written assignment needs to read the text, not reproduce
 * every layout detail of the original document.
 */

import { readZipEntryByName, ZipParseError } from "@/lib/browser-zip";

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

class DocxParseError extends Error {}

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
  let xmlBytes;
  try {
    xmlBytes = await readZipEntryByName(fileBytes, "word/document.xml");
  } catch (error) {
    throw new DocxParseError(error instanceof ZipParseError ? error.message : "Couldn't read this .docx file.");
  }
  if (!xmlBytes) throw new DocxParseError("This .docx file is missing word/document.xml — it may be corrupt.");
  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  return parseParagraphs(xml);
}

export { DocxParseError };
