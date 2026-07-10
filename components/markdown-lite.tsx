"use client";

import Link from "next/link";
import { ChevronRight, PlayCircle } from "lucide-react";

/** Resolves a {{lesson|Course Title|Lesson Title}} tag to a real link, or null if no match. */
export type LessonResolver = (courseTitle: string, lessonTitle: string) => string | null;

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|\{\{lesson\|[^|}]+\|[^}]+\}\})/g;

function formatInline(text: string, keyPrefix: string, resolveLesson?: LessonResolver): React.ReactNode[] {
  return text
    .split(INLINE_PATTERN)
    .filter((seg) => seg.length > 0)
    .map((seg, i) => {
      const key = `${keyPrefix}-${i}`;
      if (seg.startsWith("{{lesson|") && seg.endsWith("}}")) {
        const [courseTitle, lessonTitle] = seg.slice(9, -2).split("|");
        const href = resolveLesson?.(courseTitle?.trim() ?? "", lessonTitle?.trim() ?? "");
        if (href) {
          const title = lessonTitle?.trim() ?? "";
          return (
            <Link
              key={key}
              href={href}
              title={title}
              className="my-1.5 flex max-w-full items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-2.5 py-2 text-[13px] font-medium text-zinc-800 shadow-soft transition hover:border-primary/40 hover:bg-primary/10"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <PlayCircle className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            </Link>
          );
        }
        return <span key={key} className="font-semibold">{lessonTitle?.trim() ?? seg}</span>;
      }
      if (seg.startsWith("**") && seg.endsWith("**")) {
        return (
          <strong key={key} className="font-semibold">
            {seg.slice(2, -2)}
          </strong>
        );
      }
      if (seg.startsWith("*") && seg.endsWith("*")) {
        return <em key={key}>{seg.slice(1, -1)}</em>;
      }
      return <span key={key}>{seg}</span>;
    });
}

type Block = { type: "p"; lines: string[] } | { type: "ul"; items: string[] };

/** Groups raw lines into paragraph/list blocks — a "- " line starts a list even
 * mid-paragraph (e.g. a "By path:" header immediately followed by bullets). */
function groupBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let paraBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushPara = () => {
    if (paraBuffer.length) blocks.push({ type: "p", lines: paraBuffer });
    paraBuffer = [];
  };
  const flushList = () => {
    if (listBuffer.length) blocks.push({ type: "ul", items: listBuffer });
    listBuffer = [];
  };

  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      flushPara();
      flushList();
    } else if (trimmed.startsWith("- ")) {
      flushPara();
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList();
      paraBuffer.push(raw);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

/** Renders **bold**, *italic*, "- " bullet lists and {{lesson|Course|Lesson}} action
 * chips from a model reply. `cursor` (if given) is appended to the very last line. */
export function renderMarkdownLite(content: string, cursor: React.ReactNode = null, resolveLesson?: LessonResolver): React.ReactNode {
  const blocks = groupBlocks(content);
  return blocks.map((block, bi) => {
    const isLastBlock = bi === blocks.length - 1;
    if (block.type === "ul") {
      return (
        <ul key={bi} className="mb-2 list-disc space-y-1 pl-4 last:mb-0">
          {block.items.map((item, li) => (
            <li key={li}>
              {formatInline(item, `${bi}-${li}`, resolveLesson)}
              {isLastBlock && li === block.items.length - 1 && cursor}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p key={bi} className="mb-2 last:mb-0">
        {block.lines.map((line, li) => (
          <span key={li}>
            {formatInline(line, `${bi}-${li}`, resolveLesson)}
            {isLastBlock && li === block.lines.length - 1 && cursor}
            {li < block.lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
  });
}

/** True if `revealedText` ends mid-way through an unclosed {{...}} tag. */
export function endsInOpenTag(revealedText: string): boolean {
  const lastOpen = revealedText.lastIndexOf("{{");
  const lastClose = revealedText.lastIndexOf("}}");
  return lastOpen > lastClose;
}
