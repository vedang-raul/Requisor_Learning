"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink, BookOpen, GraduationCap, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AiSource } from "@/lib/ai/sources";
import { useStore } from "@/lib/store";

interface AiSourcesProps {
  sources: AiSource[];
  defaultOpen?: boolean;
  className?: string;
}

export function AiSources({ sources, defaultOpen = false, className }: AiSourcesProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!sources.length) return null;

  return (
    <div className={cn("mt-3 select-none text-xs", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <Info className="h-3 w-3 shrink-0" />
        <span>Sources ({sources.length})</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sources.map((source, i) => (
            <SourceChip key={i} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function LessonChip({ source, base }: { source: Extract<AiSource, { type: "lesson" }>; base: string }) {
  const url = useLessonUrl(source.courseName, source.lessonTitle);
  const chipClass = cn(base, "border-indigo-200 bg-indigo-50 text-indigo-700", url && "hover:border-indigo-400 hover:bg-indigo-100 cursor-pointer");
  const inner = (
    <>
      <BookOpen className="h-3 w-3 shrink-0" />
      <span className="max-w-[220px] truncate">{source.lessonTitle}</span>
    </>
  );
  return (
    <div className="flex flex-col gap-0.5">
      {url
        ? <a href={url} className={chipClass}>{inner}</a>
        : <span className={chipClass}>{inner}</span>}
      {source.section && (
        <span className="ml-1 text-[11px] leading-snug text-indigo-400">§ {source.section}</span>
      )}
    </div>
  );
}

function useLessonUrl(courseName: string, lessonTitle: string): string | null {
  const { state } = useStore();
  const name = courseName.toLowerCase();
  const title = lessonTitle.toLowerCase();
  const role = state.user?.role;
  for (const course of state.courses) {
    if (course.title.toLowerCase() !== name) continue;
    const lesson = course.lessons.find((l) => l.title.toLowerCase() === title);
    if (lesson) {
      if (role === "tutor" || role === "admin") {
        return `/app/tutor?course=${encodeURIComponent(course.slug)}`;
      }
      return `/app/learn?course=${encodeURIComponent(course.slug)}&lesson=${encodeURIComponent(lesson.id)}`;
    }
  }
  return null;
}

function useCourseUrl(slug: string): string | null {
  const { state } = useStore();
  const role = state.user?.role;
  if (role === "tutor" || role === "admin") {
    return `/app/tutor?course=${encodeURIComponent(slug)}`;
  }
  return null;
}

function CourseChip({ source, base }: { source: Extract<AiSource, { type: "course" }>; base: string }) {
  const url = useCourseUrl(source.slug);
  const chipClass = cn(base, "border-indigo-200 bg-indigo-50 text-indigo-700", url && "hover:border-indigo-400 hover:bg-indigo-100 cursor-pointer");
  const inner = (
    <>
      <GraduationCap className="h-3 w-3 shrink-0" />
      <span className="max-w-[220px] truncate">{source.title}</span>
    </>
  );
  return url
    ? <a href={url} className={chipClass}>{inner}</a>
    : <span className={chipClass}>{inner}</span>;
}

function SourceChip({ source }: { source: AiSource }) {
  const base =
    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors";

  if (source.type === "url") {
    const chip = (
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          base,
          "border-primary/20 bg-primary/5 text-primary hover:border-primary/40 hover:bg-primary/10"
        )}
      >
        <ExternalLink className="h-3 w-3 shrink-0" />
        <span className="max-w-[220px] truncate">{source.title}</span>
      </a>
    );
    if (!source.snippet) return chip;
    return (
      <div className="flex flex-col gap-0.5">
        {chip}
        <span className="ml-1 max-w-[300px] text-[11px] leading-snug text-zinc-400 italic">"{source.snippet}"</span>
      </div>
    );
  }

  if (source.type === "lesson") {
    return <LessonChip source={source} base={base} />;
  }

  if (source.type === "course") {
    return <CourseChip source={source} base={base} />;
  }

  // context
  return (
    <span
      className={cn(
        base,
        "border-zinc-200 bg-zinc-50 text-zinc-500"
      )}
    >
      <Info className="h-3 w-3 shrink-0" />
      <span>{source.label}</span>
    </span>
  );
}
