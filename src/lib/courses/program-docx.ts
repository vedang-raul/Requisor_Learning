/**
 * Program Builder documents as Word (.docx) files, built in the browser with
 * JSZip: the curriculum blueprint and the employer proposal, with the same
 * content and order as their printed (PDF) versions. Nothing leaves the browser.
 */
import JSZip from "jszip";
import type { Curriculum, Proposal } from "@/lib/courses/program-builder";
import { BLUEPRINT_LABEL } from "@/lib/courses/program-builder";
import { isPreviewUrl } from "@/lib/courses/preview-modules";

type Run = { text: string; bold?: boolean };
export type DocBlock =
  | { kind: "kicker" | "title" | "heading" | "subheading" | "paragraph" | "bullet" | "label" | "footer"; runs: Run[] }
  | { kind: "table"; header: string[]; rows: string[][]; alignLast?: boolean; bold?: number[] };

/** How the document looks: its accent colour and, optionally, a logo at the top. */
export type DocStyle = {
  /** "#RRGGBB" */
  accent: string;
  /** A PNG, already sized: width and height in pixels. */
  logo?: { png: Uint8Array; width: number; height: number } | null;
};
export const DEFAULT_DOC_STYLE: DocStyle = { accent: "#0F766E" };
const hex = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? color.slice(1).toUpperCase() : "0F766E");
const run = (text: string, bold = false): Run => ({ text, bold });
const block = (kind: Exclude<DocBlock["kind"], "table">, ...runs: (Run | string)[]): DocBlock =>
  ({ kind, runs: runs.map((r) => (typeof r === "string" ? run(r) : r)) });

export function blueprintBlocks(curriculum: Curriculum, employer: string, date: string): DocBlock[] {
  const blocks: DocBlock[] = [
    block("kicker", BLUEPRINT_LABEL.toUpperCase()),
    block("title", curriculum.title),
    block("paragraph", curriculum.description),
  ];
  if (employer.trim()) blocks.push(block("paragraph", "Prepared for ", run(employer.trim(), true)));
  blocks.push(
    { kind: "table", header: ["Audience", "Level", "Format", "Duration"], rows: [[curriculum.audience, curriculum.level, curriculum.format, curriculum.duration]] },
    block("heading", "Learning outcomes"),
    ...curriculum.outcomes.map((outcome) => block("bullet", outcome)),
    block("heading", "Modules"),
  );
  curriculum.modules.forEach((module, i) => {
    blocks.push(block("subheading", `Module ${i + 1}: ${module.title}`));
    if (module.description) blocks.push(block("paragraph", module.description));
    blocks.push(block("label", "Submodules"), ...module.submodules.map((sub) => block("bullet", sub)));
    if (module.activities.length) blocks.push(block("label", "Learning activities"), ...module.activities.map((activity) => block("bullet", activity)));
  });
  blocks.push(
    block("heading", "Assessment & evidence"),
    block("paragraph", curriculum.assessment),
    block("footer", `Generated with the Alma 41 Program Builder · ${date}`),
  );
  return blocks;
}

export function proposalBlocks(proposal: Proposal): DocBlock[] {
  return [
    block("kicker", "CUSTOM TRAINING PROPOSAL"),
    block("title", proposal.title),
    block("paragraph", "Prepared for ", run(proposal.employer, true)),
    block("paragraph", [proposal.date, proposal.preparedBy, proposal.platform].filter(Boolean).join(" · ")),
    block("heading", "Need identified"),
    block("paragraph", proposal.need),
    block("heading", "Program description"),
    block("paragraph", proposal.description),
    block("heading", "Learning outcomes"),
    ...proposal.outcomes.map((outcome) => block("bullet", outcome)),
    block("heading", "Curriculum"),
    ...proposal.modules.flatMap((module) => [block("subheading", module.title), block("paragraph", module.summary)]),
    ...(proposal.preview && isPreviewUrl(proposal.preview.url) ? [
      block("heading", "Preview the course"),
      block("paragraph", "See the selected modules for yourself, no account needed: ", run(proposal.preview.url, true)),
      block("paragraph", `The link is available until ${proposal.preview.until}.`),
    ] : []),
    block("heading", "Delivery & measurement"),
    block("paragraph", proposal.delivery),
    ...proposal.deliveryPoints.map((point) => block("bullet", point)),
    block("heading", "Investment"),
    {
      kind: "table", header: ["Item", "Basis", "Amount"], alignLast: true,
      rows: [...proposal.pricing.map((row) => [row.item, row.basis, row.amount]), ["Total — first cohort", "", proposal.total]],
      bold: [proposal.pricing.length],
    },
    block("paragraph", proposal.pricingNote),
    block("footer", `Generated with the Alma 41 Program Builder · ${proposal.date}`),
  ];
}

// ── WordprocessingML ────────────────────────────────────────────────────────
const escapeXml = (text: string) =>
  // eslint-disable-next-line no-control-regex
  text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const runXml = ({ text, bold }: Run) =>
  `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

const STYLE: Record<Exclude<DocBlock["kind"], "table">, string> = {
  kicker: "Kicker", title: "Title", heading: "Heading1", subheading: "Heading2", paragraph: "Normal", bullet: "Bullet", label: "Label", footer: "Footer",
};

function paragraphXml(kind: Exclude<DocBlock["kind"], "table">, runs: Run[]): string {
  const body = kind === "bullet" ? [run("•\t"), ...runs] : runs;
  return `<w:p><w:pPr><w:pStyle w:val="${STYLE[kind]}"/></w:pPr>${body.map(runXml).join("")}</w:p>`;
}

function tableXml(table: Extract<DocBlock, { kind: "table" }>): string {
  const cols = table.header.length;
  const width = Math.floor(9360 / cols);
  const border = `w:val="single" w:sz="4" w:space="0" w:color="D4D4D8"`;
  const cell = (text: string, col: number, opts: { header?: boolean; bold?: boolean }) => {
    const right = table.alignLast && col === cols - 1 ? `<w:jc w:val="right"/>` : "";
    const shade = opts.header ? `<w:shd w:val="clear" w:color="auto" w:fill="F4F4F5"/>` : "";
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shade}</w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/>${right}</w:pPr>${runXml(run(text, opts.header || opts.bold))}</w:p></w:tc>`;
  };
  const row = (cells: string[], opts: { header?: boolean; bold?: boolean }) =>
    `<w:tr>${cells.map((text, col) => cell(text, col, opts)).join("")}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top ${border}/><w:left ${border}/><w:bottom ${border}/><w:right ${border}/><w:insideH ${border}/><w:insideV ${border}/></w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${table.header.map(() => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>`
    + row(table.header, { header: true })
    + table.rows.map((cells, i) => row(cells, { bold: table.bold?.includes(i) })).join("")
    + `</w:tbl><w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr></w:p>`;
}

/** The logo as an inline picture, at most 0.6 in tall and 2.5 in wide (EMU: 914400 per inch). */
function logoXml(logo: NonNullable<DocStyle["logo"]>): string {
  const EMU = 914400;
  let cy = Math.round(0.6 * EMU);
  let cx = Math.round((cy * logo.width) / Math.max(1, logo.height));
  if (cx > 2.5 * EMU) { cx = Math.round(2.5 * EMU); cy = Math.round((cx * logo.height) / Math.max(1, logo.width)); }
  return `<w:p><w:pPr><w:spacing w:after="200"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logo"/>`
    + `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

export function documentXml(blocks: DocBlock[], style: DocStyle = DEFAULT_DOC_STYLE): string {
  const body = (style.logo ? logoXml(style.logo) : "") + blocks.map((b) => (b.kind === "table" ? tableXml(b) : paragraphXml(b.kind, b.runs))).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`
    + ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
    + ` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}`
    + `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1300" w:right="1440" w:bottom="1300" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const paraStyle = (id: string, name: string, ppr: string, rpr: string) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;

const stylesXml = (BRAND: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
  + `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:color w:val="27272A"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
  + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
  + paraStyle("Kicker", "Kicker", `<w:spacing w:after="40"/>`, `<w:b/><w:color w:val="${BRAND}"/><w:spacing w:val="20"/><w:sz w:val="18"/>`)
  + paraStyle("Title", "Title", `<w:spacing w:after="160"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="6" w:color="${BRAND}"/></w:pBdr>`, `<w:b/><w:color w:val="18181B"/><w:sz w:val="44"/>`)
  + paraStyle("Heading1", "heading 1", `<w:keepNext/><w:spacing w:before="300" w:after="100"/><w:outlineLvl w:val="0"/>`, `<w:b/><w:color w:val="${BRAND}"/><w:sz w:val="28"/>`)
  + paraStyle("Heading2", "heading 2", `<w:keepNext/><w:spacing w:before="200" w:after="60"/><w:outlineLvl w:val="1"/>`, `<w:b/><w:color w:val="18181B"/><w:sz w:val="23"/>`)
  + paraStyle("Label", "Label", `<w:keepNext/><w:spacing w:before="80" w:after="40"/>`, `<w:b/><w:caps/><w:color w:val="${BRAND}"/><w:sz w:val="17"/>`)
  + paraStyle("Bullet", "Bullet", `<w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs><w:spacing w:after="60"/><w:ind w:left="360" w:hanging="360"/>`, ``)
  + paraStyle("TableText", "Table text", `<w:spacing w:after="0"/>`, ``)
  + paraStyle("Footer", "Program footer", `<w:spacing w:before="400"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="6" w:color="D4D4D8"/></w:pBdr>`, `<w:color w:val="71717A"/><w:sz w:val="17"/>`)
  + `</w:styles>`;

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>`
  + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  + `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const documentRels = (withLogo: boolean) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
  + (withLogo ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>` : "")
  + `</Relationships>`;

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The blocks as a .docx package, in the given style. */
export function buildDocx(blocks: DocBlock[], style: DocStyle = DEFAULT_DOC_STYLE): JSZip {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES);
  zip.file("_rels/.rels", ROOT_RELS);
  zip.file("word/_rels/document.xml.rels", documentRels(Boolean(style.logo)));
  zip.file("word/document.xml", documentXml(blocks, style));
  zip.file("word/styles.xml", stylesXml(hex(style.accent)));
  if (style.logo) zip.file("word/media/logo.png", style.logo.png);
  return zip;
}

/** Builds the file and hands it to the browser as a download (browser only). */
export async function downloadDocx(blocks: DocBlock[], fileName: string, style: DocStyle = DEFAULT_DOC_STYLE): Promise<void> {
  const blob = await buildDocx(blocks, style).generateAsync({ type: "blob", mimeType: DOCX_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150) || "document"}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
