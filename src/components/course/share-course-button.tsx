"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Share2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/types";

/** The course's quick share link (see src/app/c/[slug]/route.ts). */
export function courseShareUrl(slug: string, origin: string): string {
  return `${origin}/c/${encodeURIComponent(slug)}`;
}

/**
 * Share a course: a short link to copy (or the device's share sheet). The link
 * itself grants nothing: whoever opens it signs in first and then sees the
 * course only if they're allowed to. The note says who that is.
 */
export function ShareCourseButton({ course, className, label = "Share" }: { course: Pick<Course, "slug" | "title" | "published" | "universityId">; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setUrl(courseShareUrl(course.slug, window.location.origin)); }, [course.slug]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked: select the text so it can be copied by hand.
      const input = boxRef.current?.querySelector("input");
      input?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  async function shareSheet() {
    try { await navigator.share({ title: course.title, text: `Take a look at "${course.title}" on Alma 41`, url }); } catch { /* cancelled */ }
  }

  const who = course.published === false
    ? { tone: "warn", text: "This course is a draft: people who open the link can't see it until you publish it." }
    : course.universityId
      ? { tone: "info", text: "Only people at this course's university can open it. Anyone else is asked to sign in and won't see it." }
      : { tone: "info", text: "Anyone with an Alma 41 account can open it after signing in. New people can sign up first." };

  return (
    <div ref={boxRef} className="relative inline-flex">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" className={className}>
        <Share2 className="h-4 w-4" aria-hidden="true" />{label}
      </button>
      {open && (
        <div role="dialog" aria-label={`Share ${course.title}`} className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-zinc-200 bg-white p-4 text-left text-zinc-900 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-primary" aria-hidden="true" />Share this course</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="focus-ring rounded-md p-1 text-zinc-400 hover:text-zinc-700"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-3 flex gap-2">
            <input readOnly value={url} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} className="focus-ring h-10 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700" />
            <button type="button" onClick={() => void copy()} className={cn("focus-ring inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white transition", copied ? "bg-emerald-600" : "bg-primary hover:bg-primary/90")}>
              {copied ? <><Check className="h-4 w-4" />Copied</> : <><Copy className="h-4 w-4" />Copy</>}
            </button>
          </div>
          <p role="status" className={cn("mt-2 text-xs leading-relaxed", who.tone === "warn" ? "text-amber-700" : "text-zinc-500")}>{who.text}</p>
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button type="button" onClick={() => void shareSheet()} className="focus-ring mt-2 text-xs font-semibold text-primary hover:underline">Share with another app…</button>
          )}
        </div>
      )}
    </div>
  );
}
