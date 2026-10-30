/**
 * Lesson readings: the Markdown a tutor writes, or an import brings over from
 * Canvas, shown with its structure. Headings (#–######), paragraphs, bullet and
 * numbered lists (nested by indentation), quotes, dividers, simple tables, code
 * blocks, and inline **bold**, *italic*, `code`, links and images.
 *
 * Everything is built as React elements, never as HTML, so nothing in a
 * reading can run in the browser. Links work only for https:// and mailto:
 * addresses and the app's own pages; images only from https:// or the app's
 * own file store (/api/resources/…). Anything else stays as plain text.
 * (Chat replies use the smaller markdown-lite.)
 */
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|!\[[^\]\n]*\]\([^)\s]+\)|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\s][^*\n]*\*)/g;

export function safeLinkHref(href: string): string | null {
  const h = href.trim();
  if (/^https:\/\/[^\s]+$/i.test(h) || /^mailto:[^\s@]+@[^\s@]+$/i.test(h)) return h;
  if (/^\/(?!\/)[^\s\\]*$/.test(h) && (h.startsWith("/app/") || h.startsWith("/api/resources/") || h.startsWith("/c/"))) return h;
  return null;
}

export function safeImageSrc(src: string): string | null {
  const s = src.trim();
  if (/^https:\/\/[^\s]+$/i.test(s)) return s;
  if (/^\/api\/resources\/[A-Za-z0-9_-]+$/.test(s)) return s;
  return null;
}

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((seg, i) => {
    const k = `${key}-${i}`;
    if (seg.startsWith("**") && seg.endsWith("**") && seg.length > 4) return <strong key={k} className="font-semibold text-zinc-900">{seg.slice(2, -2)}</strong>;
    if (seg.startsWith("`") && seg.endsWith("`") && seg.length > 2) return <code key={k} className="rounded bg-zinc-100 px-1 py-0.5 text-[0.92em]">{seg.slice(1, -1)}</code>;
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(seg);
    if (image) {
      const src = safeImageSrc(image[2]);
      // eslint-disable-next-line @next/next/no-img-element -- tutor content from any https host or our file store
      return src ? <img key={k} src={src} alt={image[1]} loading="lazy" className="my-2 max-h-[28rem] max-w-full rounded-xl border border-zinc-200" /> : null;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(seg);
    if (link) {
      const label = link[1].replace(/\*\*/g, "");
      const href = safeLinkHref(link[2]);
      if (!href) return <span key={k}>{label}</span>;
      const external = !href.startsWith("/");
      return (
        <a key={k} href={href} className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}>
          {label}
        </a>
      );
    }
    if (seg.startsWith("*") && seg.endsWith("*") && seg.length > 2) return <em key={k}>{seg.slice(1, -1)}</em>;
    return <Fragment key={k}>{seg}</Fragment>;
  });
}

type ListItem = { ordered: boolean; level: number; number: number; text: string };
type Block =
  | { type: "h"; level: number; text: string }
  | { type: "p"; lines: string[] }
  | { type: "list"; items: ListItem[] }
  | { type: "quote"; lines: string[] }
  | { type: "hr" }
  | { type: "table"; rows: string[][] }
  | { type: "code"; content: string };

const LIST_ITEM = /^(\s*)(?:([-*+])|(\d{1,4})[.)])\s+(.*)$/;

function blocks(content: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: ListItem[] = [];
  let quote: string[] = [];
  let table: string[][] = [];
  let code: string[] | null = null;
  const flush = () => {
    if (para.length) out.push({ type: "p", lines: para });
    if (list.length) out.push({ type: "list", items: list });
    if (quote.length) out.push({ type: "quote", lines: quote });
    if (table.length) out.push({ type: "table", rows: table });
    para = []; list = []; quote = []; table = [];
  };
  for (const raw of content.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const trimmed = line.trim();
    if (code !== null) {
      if (trimmed.startsWith("```")) { out.push({ type: "code", content: code.join("\n") }); code = null; } else code.push(raw);
      continue;
    }
    if (trimmed.startsWith("```")) { flush(); code = []; continue; }
    if (!trimmed) { flush(); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) { flush(); out.push({ type: "h", level: heading[1].length, text: heading[2] }); continue; }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flush(); out.push({ type: "hr" }); continue; }
    const item = LIST_ITEM.exec(line);
    if (item) {
      if (para.length || quote.length || table.length) { const keep = list; list = []; flush(); list = keep; }
      list.push({ ordered: !item[2], level: Math.min(4, Math.floor(item[1].replace(/\t/g, "  ").length / 2)), number: item[3] ? Number(item[3]) : 0, text: item[4] });
      continue;
    }
    if (trimmed.startsWith(">")) {
      if (!quote.length) flush();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) {
      if (!table.length) flush();
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) table.push(cells);
      continue;
    }
    if (list.length || quote.length || table.length) flush();
    para.push(trimmed);
  }
  if (code !== null) out.push({ type: "code", content: code.join("\n") });
  flush();
  return out;
}

/** Nested lists from flat items with indentation levels. */
function renderList(items: ListItem[], key: string): ReactNode {
  const top = Math.min(...items.map((i) => i.level));
  const groups: { item: ListItem; children: ListItem[] }[] = [];
  for (const it of items) {
    if (it.level > top && groups.length) groups[groups.length - 1].children.push(it);
    else groups.push({ item: it, children: [] });
  }
  const ordered = groups[0]?.item.ordered;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag key={key} start={ordered && groups[0].item.number > 1 ? groups[0].item.number : undefined}
      className={cn("my-2 space-y-1 pl-5", ordered ? "list-decimal" : "list-disc", "marker:text-zinc-400")}>
      {groups.map((g, i) => (
        <li key={i} className="pl-1">
          {inline(g.item.text, `${key}-${i}`)}
          {g.children.length > 0 && renderList(g.children, `${key}-${i}-c`)}
        </li>
      ))}
    </Tag>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-6 text-xl font-bold",
  2: "mt-6 text-lg font-semibold",
  3: "mt-5 text-base font-semibold",
  4: "mt-4 text-[15px] font-semibold",
  5: "mt-3 text-sm font-semibold",
  6: "mt-3 text-sm font-semibold text-zinc-700",
};

export function LessonMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("text-sm leading-relaxed text-zinc-800 [&>*:first-child]:mt-0", className)}>
      {blocks(content).map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "h": {
            const H = `h${Math.min(6, b.level + 1)}` as "h2" | "h3" | "h4" | "h5" | "h6";
            return <H key={key} className={cn("mb-2 text-zinc-900", HEADING_CLASS[b.level])}>{inline(b.text, key)}</H>;
          }
          case "p":
            return <p key={key} className="my-2">{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, `${key}-${j}`)}</Fragment>)}</p>;
          case "list":
            return renderList(b.items, key);
          case "quote":
            return <blockquote key={key} className="my-3 border-l-4 border-primary/30 bg-primary/[0.03] py-1.5 pl-4 pr-2 text-zinc-700">{b.lines.map((l, j) => <p key={j} className="my-1">{inline(l, `${key}-${j}`)}</p>)}</blockquote>;
          case "hr":
            return <hr key={key} className="my-5 border-zinc-200" />;
          case "table":
            return (
              <div key={key} className="my-3 overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <tbody>{b.rows.map((r, j) => <tr key={j} className="border-b border-zinc-200">{r.map((c, n) => <td key={n} className={cn("px-2.5 py-1.5 align-top", j === 0 && "font-semibold")}>{inline(c, `${key}-${j}-${n}`)}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
          case "code":
            return <pre key={key} className="my-3 overflow-x-auto rounded-xl bg-zinc-900 px-4 py-3 text-[12.5px] leading-relaxed text-zinc-100"><code>{b.content}</code></pre>;
        }
      })}
    </div>
  );
}
