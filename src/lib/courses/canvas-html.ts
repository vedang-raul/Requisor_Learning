/**
 * A Canvas page (HTML) → lesson material, in the browser for the in-app
 * Canvas import. Mirrors services/imscc-api/imscc_api/content.py.
 *
 * Canvas's design-tool templates wrap content in tables (class
 * "esComponent-<kind>"): a title row naming the component, then rows of
 * "key-<field>" label / value cells, plus author instructions between
 * "## … ##". Those are unwrapped, the labels and instructions dropped, and the
 * rest written as the Markdown that lesson readings use. Along the way:
 * YouTube videos (including the template's escaped "{{<iframe …>}}" embeds),
 * https links, and "summary" callouts as key takeaways.
 *
 * Parsed with DOMParser, which never runs scripts or loads images.
 */

const YOUTUBE = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:[^"'<>\s]*&)?v=|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
const INSTRUCTION = /##[^#]*?##/g;
const PLACEHOLDERS = new Set(["link1", "link2", "link3", "transcript", "slides", "options", "image", "title"]);

export type CanvasPage = {
  body: string;                                  // Markdown
  words: number;
  youtubeIds: string[];
  videoTitles: Record<string, string>;
  links: { label: string; url: string }[];       // https only
  takeaways: string[];
};

const clean = (s: string) => s.replace(/ /g, " ").replace(INSTRUCTION, " ").replace(/[ \t\r\f\v]+/g, " ").trim();
const decode = (s: string) => new DOMParser().parseFromString(`<!doctype html><body>${s}`, "text/html").body.textContent ?? "";

function collectVideos(s: string, out: CanvasPage) {
  for (const m of decode(s).matchAll(YOUTUBE)) if (!out.youtubeIds.includes(m[1])) out.youtubeIds.push(m[1]);
}

function rows(table: Element): [string, Element][] {
  const out: [string, Element][] = [];
  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const key = Array.from(tr.querySelectorAll("td")).find((td) => Array.from(td.classList).some((c) => c.startsWith("key-")));
    const cells = tr.querySelectorAll("td");
    if (!key || cells.length < 2) continue;
    out.push([Array.from(key.classList).find((c) => c.startsWith("key-"))!.slice(4), cells[1]]);
  }
  return out;
}

const meaningful = (cell: Element | undefined) => {
  if (!cell) return false;
  if (cell.querySelector("img, iframe, a, li")) return true;
  const t = clean(cell.textContent ?? "").toLowerCase();
  return Boolean(t) && !PLACEHOLDERS.has(t);
};

function takeawayLines(cell: Element | undefined): string[] {
  if (!cell) return [];
  let items = Array.from(cell.querySelectorAll("li")).map((li) => clean(li.textContent ?? ""));
  if (!items.length) items = clean(cell.textContent ?? "").split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);
  return items.filter(Boolean).map((i) => i.slice(0, 500)).slice(0, 8);
}

/** Replaces each template table with its real content. */
function unwrap(doc: Document, out: CanvasPage) {
  for (const table of Array.from(doc.querySelectorAll("table[class*='esComponent-']"))) {
    const kind = Array.from(table.classList).find((c) => c.startsWith("esComponent-"))?.slice("esComponent-".length) ?? "";
    const label = clean(table.querySelector("th")?.textContent ?? "");
    const r = rows(table);
    const first = (name: string) => r.find(([n]) => n === name)?.[1];
    const textOf = (name: string) => (meaningful(first(name)) ? clean(first(name)!.textContent ?? "") : "");
    const parts: Node[] = [];
    const el = (tag: string, text: string) => { const e = doc.createElement(tag); e.textContent = text; return e; };
    const move = (name: string) => {
      const cell = first(name);
      if (!meaningful(cell)) return;
      const div = doc.createElement("div");
      while (cell!.firstChild) div.appendChild(cell!.firstChild);
      parts.push(div);
    };

    if (kind === "esPresentationMainHeader" || kind === "esPresentationSectionHeader" || kind === "sectionDivider") {
      const title = textOf("title");
      if (title) parts.push(el(kind === "esPresentationMainHeader" ? "h1" : "h2", title));
      else if (kind === "sectionDivider") parts.push(doc.createElement("hr"));
    } else if (kind === "callout") {
      const title = textOf("title");
      if (/summary/i.test(label) || /takeaway|summary/i.test(title)) out.takeaways.push(...takeawayLines(first("content")));
      if (title) parts.push(el("h3", title));
      move("content");
    } else if (kind === "captionedImage") {
      const caption = textOf("caption");
      if (caption) { const p = doc.createElement("p"); p.appendChild(el("em", caption)); parts.push(p); }
    } else if (kind === "quoteBox") {
      const quote = textOf("quote");
      if (quote) { const source = textOf("source"); parts.push(el("blockquote", source ? `${quote} — ${source}` : quote)); }
    } else if (kind === "contentModal") {
      const question = textOf("launcherText");
      if (question) {
        const p = doc.createElement("p");
        p.appendChild(el("strong", "Knowledge check:"));
        p.append(` ${question}`);
        parts.push(p);
        const a = doc.createElement("p");
        a.appendChild(el("em", "Answer:"));
        parts.push(a);
        move("body");
      }
    } else if (kind === "videoBoxWithLinks") {
      const titles: string[] = [], ids: string[] = [];
      for (const [name, cell] of r) {
        if (name === "iframe") {
          for (const m of decode(cell.innerHTML).matchAll(YOUTUBE)) { ids.push(m[1]); if (!out.youtubeIds.includes(m[1])) out.youtubeIds.push(m[1]); }
        } else if (name === "title" && meaningful(cell)) {
          titles.push(clean(cell.textContent ?? ""));
          parts.push(el("h3", titles[titles.length - 1]));
        } else if (name === "transcript" || name === "slides" || name === "otherLinks") {
          for (const a of Array.from(cell.querySelectorAll("a"))) { const p = doc.createElement("p"); p.appendChild(a); parts.push(p); }
        }
      }
      if (titles.length && titles.length === ids.length) ids.forEach((id, i) => { out.videoTitles[id] ??= titles[i]; });
    } else if (kind !== "moduleObjectives") {
      for (const [name] of r) if (name !== "options") move(name);
    }
    const holder = doc.createElement("div");
    parts.forEach((p) => holder.appendChild(p));
    table.replaceWith(holder);
  }
}

function inline(node: Node, out: CanvasPage): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const s = node.textContent ?? "";
    if (/iframe|youtu/.test(s)) { collectVideos(s, out); if (s.includes("{{") || /<iframe/i.test(s)) return ""; }
    return s.replace(/ /g, " ").replace(INSTRUCTION, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const e = node as Element;
  const tag = e.tagName.toLowerCase();
  if (["script", "style", "caption", "head", "title", "meta", "img"].includes(tag)) return "";
  if (tag === "br") return "\n";
  if (tag === "iframe") { collectVideos(e.getAttribute("src") ?? "", out); return ""; }
  const inner = Array.from(e.childNodes).map((c) => inline(c, out)).join("");
  if (tag === "strong" || tag === "b") return inner.trim() ? `**${inner.trim()}**` : "";
  if (tag === "em" || tag === "i") return inner.trim() ? `*${inner.trim()}*` : "";
  if (tag === "code") return inner.trim() ? `\`${inner.trim()}\`` : "";
  if (tag === "a") {
    const href = (e.getAttribute("href") ?? "").trim();
    const label = clean(inner) || href;
    if (YOUTUBE.test(href)) collectVideos(href, out);
    YOUTUBE.lastIndex = 0;
    if (/^https:\/\//i.test(href)) {
      if (!out.links.some((l) => l.url === href)) out.links.push({ label: label.slice(0, 200), url: href });
      return `[${label}](${href})`;
    }
    return label;   // links to other Canvas pages or packed files: keep the words
  }
  return inner;
}

const BLOCK = new Set(["p", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "blockquote", "hr", "table", "pre", "figure", "body", "main", "tbody", "thead", "tr"]);

function blocks(node: Element, out: CanvasPage, lines: string[], depth = 0) {
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType === Node.ELEMENT_NODE && BLOCK.has((c as Element).tagName.toLowerCase())) {
      const e = c as Element;
      const tag = e.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        const t = clean(inline(e, out)).replace(/\*\*/g, "");
        if (t) lines.push(`${"#".repeat(Math.min(Number(tag[1]) + 1, 6))} ${t}`);
      } else if (tag === "ul" || tag === "ol") {
        let n = 0;
        for (const li of Array.from(e.children).filter((x) => x.tagName.toLowerCase() === "li")) {
          n += 1;
          const nested = Array.from(li.children).filter((x) => /^(ul|ol)$/i.test(x.tagName));
          nested.forEach((x) => x.remove());
          const t = clean(inline(li, out));
          if (t) lines.push(`${"  ".repeat(depth)}${tag === "ol" ? `${n}. ` : "- "}${t}`);
          for (const x of nested) { const wrap = node.ownerDocument.createElement("div"); wrap.appendChild(x); blocks(wrap, out, lines, depth + 1); }
        }
      } else if (tag === "blockquote") {
        const t = clean(inline(e, out));
        if (t) lines.push(`> ${t}`);
      } else if (tag === "hr") {
        lines.push("---");
      } else if (tag === "pre") {
        lines.push("```\n" + (e.textContent ?? "").replace(/^\n+|\n+$/g, "") + "\n```");
      } else if (tag === "table") {
        for (const tr of Array.from(e.querySelectorAll("tr"))) {
          const cells = Array.from(tr.querySelectorAll("td, th")).map((td) => clean(inline(td, out)));
          if (cells.some(Boolean)) lines.push(`| ${cells.join(" | ")} |`);
        }
      } else if (tag === "p") {
        const t = clean(inline(e, out));
        if (t && !PLACEHOLDERS.has(t.toLowerCase())) lines.push(t);
      } else {
        blocks(e, out, lines, depth);
      }
    } else {
      const t = clean(inline(c, out));
      if (t && !PLACEHOLDERS.has(t.toLowerCase())) lines.push(t);
    }
  }
}

function join(lines: string[]): string {
  const item = (l: string) => /^\s*(?:- |\d+\. |\| )/.test(l);
  const out: string[] = [];
  for (const l of lines) {
    if (out.length && !(item(l) && item(out[out.length - 1]))) out.push("");
    out.push(l);
  }
  return out.join("\n").replace(/(?:\n---\n*){2,}/g, "\n---\n").replace(/\n{3,}/g, "\n\n").replace(/^[-\n ]+|[-\n ]+$/g, "").trim();
}

function headingTakeaways(doc: Document): string[] {
  for (const h of Array.from(doc.querySelectorAll("h2, h3, h4, strong"))) {
    if (/key takeaways?|summary|what you('ll| will) learn|learning objectives/i.test(h.textContent ?? "")) {
      let n: Element | null = h;
      while (n && !n.nextElementSibling) n = n.parentElement;
      for (let sib = n?.nextElementSibling ?? null; sib; sib = sib.nextElementSibling) {
        const list = /^(UL|OL)$/.test(sib.tagName) ? sib : sib.querySelector("ul, ol");
        if (list) return Array.from(list.children).map((li) => clean(li.textContent ?? "").slice(0, 500)).filter(Boolean).slice(0, 8);
        if (/^H[1-6]$/.test(sib.tagName)) break;
      }
    }
  }
  return [];
}

export function convertCanvasHtml(html: string): CanvasPage {
  const out: CanvasPage = { body: "", words: 0, youtubeIds: [], videoTitles: {}, links: [], takeaways: [] };
  if (!html.trim()) return out;
  const doc = new DOMParser().parseFromString(html, "text/html");
  unwrap(doc, out);
  const fromHeadings = headingTakeaways(doc);
  const lines: string[] = [];
  blocks(doc.body, out, lines);
  out.body = join(lines);
  out.words = (out.body.replace(/\]\([^)]*\)/g, "]").match(/[A-Za-z0-9']+/g) ?? []).length;
  const seen = new Set<string>();
  out.takeaways = [...out.takeaways, ...fromHeadings].filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())).slice(0, 8);
  return out;
}

/** Markdown → plain text, for descriptions and briefs. */
export function markdownText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*|^>\s*|^\s*(?:- |\d+\. )|\*\*|\*|`|^---$|^\|\s*|\s*\|$/gm, "")
    .replace(/ \| /g, " · ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The first real paragraph (not a heading), cut at a sentence. */
export function summaryLine(md: string, limit = 300): string {
  const prose = md.replace(/^(?:#+ .*|---)$/gm, "");
  for (const para of markdownText(prose).split(/\n\s*\n/)) {
    const p = para.replace(/\s+/g, " ").trim();
    if (p.length < 40 || /^(knowledge check|answer:)/i.test(p)) continue;
    if (p.length <= limit) return p;
    const cut = p.slice(0, limit);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
    return end > 80 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
  }
  return "";
}
