"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { ACCESSIBILITY_OPTIONS, type AccessibilityPrefs } from "@/lib/accessibility/preferences";
import { cn } from "@/lib/utils";

/**
 * The accessibility switches as a list of large, labelled checkboxes — used
 * in onboarding and in Settings. Real <input type="checkbox">es, so screen
 * readers and the keyboard (Tab, Space) work without extra code.
 */
export function AccessibilityChoices({
  prefs,
  onChange,
  disabled,
  columns = 2,
}: {
  prefs: AccessibilityPrefs;
  onChange: (prefs: AccessibilityPrefs) => void;
  disabled?: boolean;
  columns?: 1 | 2;
}) {
  const id = useId();
  return (
    <fieldset className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")} disabled={disabled}>
      <legend className="sr-only">Accessibility options</legend>
      {ACCESSIBILITY_OPTIONS.map((option) => {
        const on = prefs[option.key];
        return (
          <label
            key={option.key}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl border-2 p-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/70",
              on ? "border-primary bg-primary/5" : "border-zinc-200 bg-white hover:border-zinc-300"
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              aria-labelledby={`${id}-${option.key}`}
              aria-describedby={`${id}-${option.key}-hint`}
              checked={on}
              onChange={(e) => onChange({ ...prefs, [option.key]: e.target.checked })}
            />
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                on ? "border-primary bg-primary text-white" : "border-zinc-300 bg-white"
              )}
            >
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span id={`${id}-${option.key}`} className="block text-sm font-semibold text-zinc-900">{option.label}</span>
              <span id={`${id}-${option.key}-hint`} className="block text-xs leading-snug text-zinc-500">{option.description}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
