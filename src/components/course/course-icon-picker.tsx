"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { COURSE_ICONS } from "@/components/course/category-icon";
import { cn } from "@/lib/utils";

/**
 * Lets a tutor choose the icon (and with it the colour) a course is shown with
 * in the sidebar, on course cards and on the course page. Shown as one compact
 * button with the current icon; the full set opens in a small grid on click.
 */
export function CourseIconPicker({ value, onChange, className }: { value: string; onChange: (key: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = COURSE_ICONS.find((icon) => icon.key === value) ?? COURSE_ICONS[0];
  const CurrentIcon = current.icon;

  // Close on a click outside or Escape (returning focus to the button).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(key: string) {
    onChange(key);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Course icon: ${current.name}. Change icon`}
        className="focus-ring flex h-10 items-center gap-2.5 rounded-xl border border-border bg-white pl-1.5 pr-3 text-sm text-zinc-800 transition-colors hover:border-zinc-300"
      >
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-white", current.cover)}>
          <CurrentIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        {current.name}
        <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="radiogroup"
          aria-label="Course icon"
          className="absolute left-0 z-30 mt-1.5 grid w-[17rem] grid-cols-6 gap-1.5 rounded-xl border border-border bg-white p-2 shadow-lg"
        >
          {COURSE_ICONS.map(({ key, name, icon: Icon, cover }) => {
            const selected = key === current.key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={name}
                title={name}
                onClick={() => choose(key)}
                className={cn(
                  "focus-ring relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br text-white transition",
                  cover,
                  selected ? "ring-2 ring-primary ring-offset-1" : "opacity-85 hover:opacity-100"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {selected && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-primary p-0.5 text-white ring-2 ring-white">
                    <Check className="h-2 w-2" aria-hidden="true" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
