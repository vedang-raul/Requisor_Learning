"use client";

import { Check } from "lucide-react";
import { COURSE_ICONS } from "@/components/category-icon";
import { cn } from "@/lib/utils";

/**
 * Lets a tutor choose the icon (and with it the colour) a course is shown with
 * in the sidebar, on course cards and on the course page.
 */
export function CourseIconPicker({ value, onChange, className }: { value: string; onChange: (key: string) => void; className?: string }) {
  return (
    <div role="radiogroup" aria-label="Course icon" className={cn("flex flex-wrap gap-2", className)}>
      {COURSE_ICONS.map(({ key, name, icon: Icon, cover }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
            onClick={() => onChange(key)}
            className={cn(
              "focus-ring relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm transition",
              cover,
              selected ? "ring-2 ring-primary ring-offset-2" : "opacity-80 hover:opacity-100"
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {selected && <span className="absolute -right-1 -top-1 rounded-full bg-primary p-0.5 text-white ring-2 ring-white"><Check className="h-2.5 w-2.5" aria-hidden="true" /></span>}
          </button>
        );
      })}
    </div>
  );
}
